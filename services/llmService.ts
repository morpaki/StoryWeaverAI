
import { GoogleGenAI } from "@google/genai";
import { LLMConfig, Message } from '../types';

export class LLMService {
  
  static async generateCompletion(
    prompt: string, 
    systemInstruction: string, 
    config: LLMConfig,
    history: Message[] = []
  ): Promise<string> {
    
    if (config.provider === 'google') {
      return this.generateGemini(prompt, systemInstruction, config, history);
    } else {
      return this.generateGeneric(prompt, systemInstruction, config, history);
    }
  }

  static async listModels(config: LLMConfig): Promise<string[]> {
    if (config.provider === 'google') return [];

    const baseUrl = this.getGenericBaseUrl(config);
    const url = `${baseUrl}/models`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${config.apiKey}`,
                ...(config.provider === 'openrouter' ? { 'HTTP-Referer': window.location.origin } : {})
            }
        });

        if (!response.ok) {
            throw new Error("Failed to fetch models");
        }

        const data = await response.json();
        // OpenAI/OpenRouter format: { data: [{ id: "model-id", ... }] }
        if (data.data && Array.isArray(data.data)) {
            return data.data.map((m: any) => m.id);
        }
        return [];
    } catch (error) {
        console.error("Error fetching models:", error);
        throw error;
    }
  }

  private static getGenericBaseUrl(config: LLMConfig): string {
      if (config.baseUrl) return config.baseUrl;
      if (config.provider === 'openrouter') return 'https://openrouter.ai/api/v1';
      if (config.provider === 'venice') return 'https://api.venice.ai/api/v1';
      return 'http://localhost:1234/v1';
  }

  private static async generateGemini(
    prompt: string, 
    systemInstruction: string, 
    config: LLMConfig,
    history: Message[]
  ): Promise<string> {
    // The API key must be obtained exclusively from the environment variable process.env.API_KEY.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Convert internal message format to Gemini format if needed, 
    // but for single text generation with system instruction, 
    // we mostly care about the prompt and system config.
    // For chat (brainstorming), we use history.

    try {
      if (history.length > 0) {
        // Chat mode
        const chatHistory = history.map(h => ({
            role: h.role === 'model' ? 'model' : 'user',
            parts: [{ text: h.content }]
        }));

        const chat = ai.chats.create({
            model: config.modelName || 'gemini-2.5-flash',
            config: {
                systemInstruction: systemInstruction,
                maxOutputTokens: config.maxTokens,
                temperature: config.temperature
            },
            history: chatHistory
        });

        const response = await chat.sendMessage({ message: prompt });
        return response.text || "";
      } else {
        // Single completion mode (Story continuation)
        const response = await ai.models.generateContent({
            model: config.modelName || 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                maxOutputTokens: config.maxTokens,
                temperature: config.temperature
            }
        });
        return response.text || "";
      }
    } catch (error: any) {
        console.error("Gemini API Error:", error);
        return `Error generating content: ${error.message}`;
    }
  }

  private static async generateGeneric(
    prompt: string, 
    systemInstruction: string, 
    config: LLMConfig,
    history: Message[]
  ): Promise<string> {
    
    const messages = [
        { role: 'system', content: systemInstruction },
        ...history,
        { role: 'user', content: prompt }
    ];

    const baseUrl = this.getGenericBaseUrl(config);
    const url = `${baseUrl}/chat/completions`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
                ...(config.provider === 'openrouter' ? { 'HTTP-Referer': window.location.origin } : {})
            },
            body: JSON.stringify({
                model: config.modelName,
                messages: messages,
                temperature: config.temperature ?? 0.7,
                max_tokens: config.maxTokens
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || "Unknown API error");
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || "";
    } catch (error: any) {
        console.error("Generic LLM Error:", error);
        return `Error: ${error.message}`;
    }
  }
}
