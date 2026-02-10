export class AIService {
    constructor(config) {
        this.config = config; // { apiProvider, apiEndpoint, apiKey, modelName, targetLanguage }
        this.language = config.targetLanguage || 'zh-CN'; // Default to Chinese
    }

    async generatePlan(bookmarks) {
        const prompt = this.buildPrompt(bookmarks);

        if (this.config.apiProvider === 'openai' || this.config.apiProvider === 'deepseek' || this.config.apiProvider === 'custom') {
            return await this.callOpenAICompatible(prompt);
        } else if (this.config.apiProvider === 'gemini') {
            return await this.callGemini(prompt);
        } else {
        }
    }

    async classifyBookmark(bookmark, folderContext) {
        const langInstruction = this.language === 'zh-CN'
            ? 'Use Chinese for general categories, English for technical terms if needed.'
            : 'Use English for all categories.';

        const prompt = `
You are a bookmark classifier.
Context: Existing folders: "${folderContext}"
Task: Determine the best folder for this bookmark.
Bookmark: "${bookmark.title}" (${bookmark.url})

Rules:
1. Use an existing folder from Context if suitable.
2. Otherwise, create a concise new category. ${langInstruction}
3. Output JSON ONLY: { "path": "Folder/Subfolder" }
`;
        // Re-use callOpenAICompatible or callGemini logic?
        // Let's create a shared internal caller or just call existing one
        // Existing ones expect a specific prompt structure?
        // No, they just take a prompt string and return JSON.
        // Wait, existing callOpenAICompatible expects specific JSON schema with "folders_to_create" etc?
        // No, it parses JSON. The schema comes from the prompt.
        // So I can just call it.

        let result;
        if (this.config.apiProvider === 'gemini') {
            result = await this.callGemini(prompt);
        } else {
            result = await this.callOpenAICompatible(prompt);
        }

        // result is the JSON object.
        // My prompt asks for { path: ... }
        return result.path;
    }

    async testConnection() {
        try {
            // Updated prompt to ensure JSON response, so callOpenAICompatible doesn't choke
            const prompt = "Hello, this is a connection test. Reply with JSON: {\"status\": \"OK\"}.";

            if (this.config.apiProvider === 'openai' || this.config.apiProvider === 'deepseek' || this.config.apiProvider === 'custom') {
                // The callOpenAICompatible now strictly expects JSON.
                // We can either make it lenient or make the prompt return JSON.
                // Making the prompt return JSON is safer.
                await this.callOpenAICompatible(prompt);
            } else if (this.config.apiProvider === 'gemini') {
                await this.callGemini(prompt);
            }
            return { success: true, message: 'Connection Successful!' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    buildPrompt(bookmarks) {
        // Simplify bookmarks for token efficiency
        const simplified = bookmarks.map(b => ({
            id: b.id,
            title: b.title,
            url: b.url,
            // path: b.path, // Path is not needed for the AI decision on where to put it, technically.
            // Actually, if we want to move them FROM somewhere, we might need context?
            // No, we are building a NEW structure primarily.
            // But wait, the previous code included 'path'. Let's keep it safe.
            path: b.path,
            is_folder: b.is_folder
        })).filter(b => b.id !== '1' && b.id !== '2'); // Exclude root folders from being moved around, just their children

        // JSON String of data
        const dataStr = JSON.stringify(simplified);

        const langPrompt = this.language === 'zh-CN'
            ? `
Language Requirement:
- **Output ALL folder names in CHINESE (Simplified)** where appropriate.
- You MAY use English for specific technical terms (e.g., "Python", "Docker", "React"), but general categories like "Learning", "Tools", "Community" MUST be in Chinese (e.g., "学习资料", "在线工具", "技术社区").
- Make folder names concise and idiomatic (e.g. use "技术社区" instead of "软件工程师的社区").
`
            : `
Language Requirement:
- Output ALL folder names in ENGLISH.
`;

        const structureRef = this.language === 'zh-CN'
            ? `
   - 开发技术 (前端, 后端, 移动端...)
   - 人工智能 (LLM, 机器学习, 数据科学...)
   - 运维与云 (DevOps, AWS, 阿里云...)
   - 学习资料 (文档, 教程, 电子书...)
   - 在线工具 (转换器, 绘图, 测试...)
   - 技术社区 (GitHub, StackOverflow, 论坛...)
   - 产品设计 (UI/UX, 原型...)
   - 阅读与资讯 (博客, 新闻...)
   - 工作项目
`
            : `
   - Development (Frontend, Backend, Mobile...)
   - AI & Data (LLM, ML, Data Science...)
   - DevOps & Cloud
   - Learning & Docs
   - Tools & Utilities
   - Communities
   - Design & Product
   - Reading & Articles
   - Work / Projects
`;

        return `
You are a "Chrome Browser Native Bookmark Intelligent Organizer AI" for Computer Professionals.
Your goal is to reorganize the user's Chrome bookmarks into a structure suitable for Software Engineers/DevOps/AI Researchers.

INPUT DATA:
${dataStr}

REQUIREMENTS:
1. **CRITICAL: OUTPUT CHANGES ONLY**. Do NOT include bookmarks that are already in a suitable folder. Only list items that need to be moved, renamed, or created. This is to avoid timeout.
2. ${langPrompt}
3. Target Structure Reference (Adapt as needed):
${structureRef}
4. Output MUST be strict JSON matching this schema:
{
  "folders_to_create": [ { "path": "Category/Subcategory", "parent_path": "Category" } ],
  "folders_to_rename": [ { "bookmark_id": "123", "new_title": "New Name" } ],
  "bookmarks_to_move": [ { "bookmark_id": "456", "target_folder_path": "Category/Subcategory" } ],
  "archive": [ { "bookmark_id": "789", "title": "...", "reason": "duplicate|low-value" } ]
}
5. Assign EVERY bookmark (that is not a folder) to a folder path.

IMPORTANT:
- **Do NOT output the full list.**
- **If a bookmark is already in the correct path, IGNORE it.**
- Return ONLY valid JSON. No Markdown block.
`;
    }

    async callOpenAICompatible(prompt) {
        // Helper to perform the fetch
        const doFetch = async (url) => {
            return await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                body: JSON.stringify({
                    model: this.config.modelName || 'gpt-4o',
                    messages: [
                        { role: 'system', content: 'You are a helpful assistant that outputs strict JSON.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.2,
                    response_format: { type: "json_object" }
                })
            });
        };

        let currentUrl = this.config.apiEndpoint;
        let response;

        try {
            response = await doFetch(currentUrl);
        } catch (netError) {
            throw new Error(`Network Error: ${netError.message}. Check your URL.`);
        }

        // Check for HTML response or 404 (common if base URL is used)
        const contentType = response.headers.get('content-type');
        const isHtml = contentType && contentType.includes('text/html');
        const isNotFound = response.status === 404;

        if ((isHtml || isNotFound) && !currentUrl.includes('/chat/completions')) {
            console.log('Detected potential base URL issue. Attempting auto-correction...');

            // Try correcting URL
            let newUrl = currentUrl.replace(/\/+$/, ''); // remove trailing slash
            if (newUrl.endsWith('/v1')) {
                newUrl += '/chat/completions';
            } else {
                newUrl += '/v1/chat/completions';
            }

            try {
                const retryResponse = await doFetch(newUrl);
                if (retryResponse.ok && retryResponse.headers.get('content-type')?.includes('application/json')) {
                    console.log('Auto-correction successful:', newUrl);
                    response = retryResponse; // Use the successful response
                }
            } catch (ignore) {
                // If retry fails, we fall back to original error
            }
        }

        if (!response.ok) {
            let errText = await response.text();
            // If still HTML after retry, give the specific hint
            if (response.headers.get('content-type')?.includes('text/html')) {
                const titleMatch = errText.match(/<title>(.*?)<\/title>/i);
                const title = titleMatch ? titleMatch[1] : 'HTML Page';
                throw new Error(`API returned HTML (${title}). Please ensure your URL ends with '/v1/chat/completions'.`);
            }
            throw new Error(`API Error: ${response.status} - ${errText}`);
        }



        // Strict JSON check before parsing
        const finalContentType = response.headers.get('content-type') || '';
        if (!finalContentType.includes('application/json')) {
            const text = await response.text();
            // Try to extract title if possible, or just truncate
            const titleMatch = text.match(/<title>(.*?)<\/title>/i);
            const title = titleMatch ? titleMatch[1] : text.substring(0, 50);
            throw new Error(`Endpoint returned non-JSON content type: ${finalContentType} (${title}). Check URL.`);
        }

        const data = await response.json();
        try {
            return JSON.parse(data.choices[0].message.content);
        } catch (e) {
            throw new Error('Failed to parse AI response as JSON');
        }
    }

    async callGemini(prompt) {
        const url = `${this.config.apiEndpoint}?key=${this.config.apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    responseMimeType: "application/json"
                }
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Gemini API Error: ${response.status} - ${err}`);
        }

        const data = await response.json();
        try {
            return JSON.parse(data.candidates[0].content.parts[0].text);
        } catch (e) {
            throw new Error('Failed to parse Gemini response as JSON');
        }
    }
}
