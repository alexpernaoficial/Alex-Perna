import { GoogleGenAI, Content, Part } from '@google/genai';
import { Message } from '../types';
import { SYSTEM_INSTRUCTION } from '../constants';

export class GenAiService {
  async sendMessage(
    history: Message[], 
    text: string, 
    attachment?: { mimeType: string; data: string }
  ): Promise<string> {
    
    // Instantiate here to get the latest key if it was just selected
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Convert app history to Gemini Content format
    // Filter out system messages or errors if any, keep user/model
    const contents: Content[] = history
      .filter(m => m.role === 'user' || m.role === 'model')
      .map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

    const newParts: Part[] = [];
    
    if (attachment) {
      newParts.push({
        inlineData: {
          mimeType: attachment.mimeType,
          data: attachment.data
        }
      });
    }

    if (text) {
        newParts.push({ text });
    } else if (!attachment) {
        // Prevent empty message if both text and attachment are missing
        newParts.push({ text: " " });
    }

    try {
        const chat = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                tools: [{ googleSearch: {} }], // Enable Google Search for web reading
            },
            history: contents
        });

        // Send the new message using 'message' property as per SDK requirements
        const result = await chat.sendMessage({
            message: newParts
        });

        let responseText = result.text || "Sem resposta.";

        // Extract and append Grounding Metadata (Sources) if available
        const groundingChunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (groundingChunks) {
            const sources = groundingChunks
                .map((chunk: any) => chunk.web)
                .filter((web: any) => web?.uri && web?.title)
                .map((web: any) => `• ${web.title}: ${web.uri}`);
            
            // Deduplicate and append
            const uniqueSources = [...new Set(sources)];
            if (uniqueSources.length > 0) {
                responseText += `\n\n📋 **Fontes Consultadas:**\n${uniqueSources.join('\n')}`;
            }
        }

        return responseText;
    } catch (error) {
        console.error("GenAI Error:", error);
        throw error;
    }
  }
}