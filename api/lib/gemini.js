import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { getZoneByName } from './firestore.js';
import config from './config.js';

// Initialize the Google Generative AI client.
// GEMINI_API_KEY is injected at runtime by Firebase Secret Manager (defineSecret in index.js).
let genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export function _setGenAIForTesting(mockGenAI) {
    genAI = mockGenAI;
}

/**
 * Executes an async function with a timeout and exponential backoff retry logic.
 * 
 * @param {Function} asyncFn - The async function to execute.
 * @param {number} maxRetries - Maximum number of retries (default: 2).
 * @param {number} timeoutMs - Timeout in milliseconds (default: 10000ms / 10s).
 * @returns {Promise<any>} The result of the async function.
 * @throws {Error} Throws an error if all retries fail or if a non-transient error occurs.
 */
async function executeWithRetryAndTimeout(asyncFn, maxRetries = 2, timeoutMs = 10000) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // Race the actual function against a timeout promise
            return await Promise.race([
                asyncFn(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), timeoutMs)
                )
            ]);
        } catch (error) {
            // Determine if the error is transient and retryable (Timeout, 429 Rate Limit, or 5xx Server Error)
            const isTransient = error.message === 'TIMEOUT_EXCEEDED' 
                || error.status === 429 
                || (error.status >= 500 && error.status < 600)
                || (error.message && error.message.includes('fetch failed'));
            
            if (!isTransient || attempt === maxRetries) {
                throw error;
            }
            
            // Apply exponential backoff (1s, 2s, 4s, etc.) before the next attempt
            const delay = Math.pow(2, attempt) * 1000;
            console.warn(`[Gemini API] Transient error on attempt ${attempt + 1}. Retrying in ${delay}ms...`, error.message);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

/**
 * Generates a response from the Gemini API based on user input, grounding it in Firestore data.
 * 
 * @param {string} userMessage - The natural-language message from the user.
 * @returns {Promise<{text: string, zoneData: Object|null}>} The generated response text and optional structured zone data.
 * @throws {Error} Throws an error if input validation fails or if the Gemini API fails.
 */
export async function getGeminiResponse(userMessage) {
    // 1. Input Validation & Sanitization
    if (!userMessage || typeof userMessage !== 'string') {
        const err = new Error('Message cannot be empty.');
        err.status = 400;
        throw err;
    }
    
    // Sanitize input: basic whitespace trim to prevent empty processing and clean up logs
    const sanitizedMessage = userMessage.trim();
    
    if (sanitizedMessage.length === 0) {
        const err = new Error('Message cannot be whitespace only.');
        err.status = 400;
        throw err;
    }

    // Enforce the configurable length cap (MAX_MESSAGE_LENGTH) to prevent abuse and
    // excessively large API requests. Value is set in functions/.env.
    if (sanitizedMessage.length > config.maxMessageLength) {
        const err = new Error(`Message exceeds the maximum allowed length of ${config.maxMessageLength} characters.`);
        err.status = 400;
        throw err;
    }

    // 2. System Prompt Design
    // Drives formatting, language matching, safety scopes, and explicit crowd rules
    const systemInstruction = `
You are a helpful venue assistant.
CRITICAL RULES:
1. Always respond in the EXACT SAME LANGUAGE that the user wrote in.
2. If the user asks about a location, crowd, directions, gates, food, washrooms, or stages, you MUST call the 'getZoneStatus' tool. NEVER hallucinate or guess zone data.
3. Keep answers short, practical, and limited to 2-3 sentences.
4. If the tool returns a crowd_level of "high", you MUST explicitly mention the high crowd level and provide one actionable suggestion (e.g., recommend an alternate gate or area).
5. If the 'getZoneStatus' tool returns a "not found" object, politely state that you do not have that information.
6. If the user's question is entirely unrelated to venue navigation, events, or facilities, politely refuse to answer and state you can only help with venue-related inquiries. Do not answer off-topic questions.
`;

    // 3. Define the Tool
    // Specifies the interface Gemini uses to request Firestore data
    const getZoneStatusTool = {
        name: "getZoneStatus",
        description: "Gets the full status of a specific zone in the venue. Returns name, type, crowd_level, description, lat, and lng.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                zone_name: {
                    type: SchemaType.STRING,
                    description: "The name of the zone, gate, washroom, stage, food court, or location the user is asking about."
                }
            },
            required: ["zone_name"]
        }
    };

    // Configure the model using the GEMINI_MODEL env var (default: gemini-2.0-flash).
    // The model name is config-driven so it can be updated without a code change.
    const model = genAI.getGenerativeModel({
        model: config.geminiModel,
        systemInstruction,
        tools: [{ functionDeclarations: [getZoneStatusTool] }],
        generationConfig: {
            temperature: 0.2, // Low temperature ensures factual, grounded responses
        }
    });

    let zoneDataToReturn = null;
    let chatSession;

    try {
        // 4. Function-calling Loop
        
        // Start a fresh, stateless chat session for this single request.
        // History is empty because multi-turn conversational memory is out of scope.
        chatSession = model.startChat({ history: [] });

        // Step A: Send the initial user message. This may return text OR a tool call request.
        let result = await executeWithRetryAndTimeout(() => chatSession.sendMessage(sanitizedMessage));

        // Check if the model decided it needs to call our 'getZoneStatus' tool
        const functionCalls = result.response.functionCalls();
        if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];
            
            if (call.name === 'getZoneStatus') {
                const zoneName = call.args.zone_name;
                
                // Step B: Execute the requested function against Firestore
                console.log(`[Gemini] Tool call requested for zone: ${zoneName}`);
                let zoneResult = await getZoneByName(zoneName);
                
                // If the zone exists, we capture this structured data so it can be passed to the frontend map
                if (zoneResult) {
                    zoneDataToReturn = zoneResult;
                } else {
                    // Provide an explicit "not found" state back to Gemini so it handles it gracefully
                    zoneResult = { status: "not found", message: `No zone matching '${zoneName}' could be found.` };
                }

                // Step C: Send the tool execution result back to Gemini so it can generate the final natural-language answer
                result = await executeWithRetryAndTimeout(() => chatSession.sendMessage([{
                    functionResponse: {
                        name: 'getZoneStatus',
                        response: zoneResult
                    }
                }]));
            }
        }

        // Return the final formatted text alongside the structured map data
        return {
            text: result.response.text(),
            zoneData: zoneDataToReturn
        };

    } catch (error) {
        console.error('Error during Gemini API flow:', error);
        // Re-throw so the HTTP function wrapper can appropriately handle and translate the status code
        throw error; 
    }
}
