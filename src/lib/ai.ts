export type Message = {
    role: "system" | "user" | "assistant";
    content: string;
};

export async function streamChat(messages: Message[], onChunk: (chunk: string) => void): Promise<string> {
    const aiUrl = localStorage.getItem("AI_API_URL") || "https://api.openai.com/v1";
    const aiKey = localStorage.getItem("AI_API_KEY") || "";
    const aiModel = localStorage.getItem("AI_MODEL") || "gpt-4o-mini";

    if (!aiKey) {
        throw new Error("AI API Key is missing. Please configure it in Settings.");
    }

    const endpoint = aiUrl.endsWith("/") ? `${aiUrl}chat/completions` : `${aiUrl}/chat/completions`;

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${aiKey}`,
        },
        body: JSON.stringify({
            model: aiModel,
            messages,
            stream: true,
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`AI API Error (${response.status}): ${errText}`);
    }

    if (!response.body) {
        throw new Error("Empty response body from AI API.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let done = false;
    let fullContent = "";

    while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim().startsWith('data: '));

            for (const line of lines) {
                const dataStr = line.replace('data: ', '').trim();
                if (dataStr === '[DONE]') continue;

                try {
                    const data = JSON.parse(dataStr);
                    const contentDelta = data.choices?.[0]?.delta?.content;
                    if (contentDelta) {
                        fullContent += contentDelta;
                        onChunk(contentDelta);
                    }
                } catch (e) {
                    // ignore parsing error for partial chunks
                }
            }
        }
    }

    return fullContent;
}
