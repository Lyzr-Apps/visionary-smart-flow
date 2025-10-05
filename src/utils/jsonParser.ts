function parseLLMJson(response: string, options: any = {}): any {
    const { attemptFix = true } = options;

    if (!response || typeof response !== 'string') {
        return {
            success: false,
            error: 'Invalid input',
            data: null,
            rawJson: null
        };
    }

    try {
        let fixedResponse = response;

        // Fix common JSON issues
        if (attemptFix) {
            // Fix trailing commas
            fixedResponse = fixedResponse.replace(/,(\s*[}\]])/g, '$1');

            // Fix unclosed braces and brackets
            const openBraces = (fixedResponse.match(/{/g) || []).length;
            const closeBraces = (fixedResponse.match(/}/g) || []).length;
            const openBrackets = (fixedResponse.match(/\[/g) || []).length;
            const closeBrackets = (fixedResponse.match(/\]/g) || []).length;

            for (let i = 0; i < openBraces - closeBraces; i++) {
                fixedResponse += '}';
            }
            for (let i = 0; i < openBrackets - closeBrackets; i++) {
                fixedResponse += ']';
            }
        }

        // Extract JSON from code blocks or plain text
        const jsonPattern = /```json\s*([\s\S]*?)```/g;
        const codePattern = /```([\s\S]*?)```/g;

        let match;
        let candidates: string[] = [];

        // Try JSON code blocks first
        while ((match = jsonPattern.exec(fixedResponse)) !== null) {
            candidates.push(match[1].trim());
        }

        // Try regular code blocks
        while ((match = codePattern.exec(fixedResponse)) !== null) {
            if (!fixedResponse.includes('```json')) {
                candidates.push(match[1].trim());
            }
        }

        // If no code blocks, try to extract JSON from plain text
        if (candidates.length === 0) {
            const text = fixedResponse.trim();

            // Look for JSON object
            let start = text.indexOf('{');
            let end = -1;
            let depth = 0;
            let inString = false;
            let escapeNext = false;

            for (let i = start; i < text.length; i++) {
                const char = text[i];

                if (escapeNext) {
                    escapeNext = false;
                    continue;
                }

                if (char === '\\') {
                    escapeNext = true;
                    continue;
                }

                if (char === '"' && !inString) {
                    inString = true;
                } else if (char === '"' && inString) {
                    inString = false;
                } else if (!inString) {
                    if (char === '{') {
                        depth++;
                    } else if (char === '}') {
                        depth--;
                        if (depth === 0) {
                            end = i + 1;
                            candidates.push(text.substring(start, end));
                            break;
                        }
                    }
                }
            }

            // Look for JSON array
            start = text.indexOf('[');
            if (start !== -1) {
                end = -1;
                depth = 0;
                inString = false;
                escapeNext = false;

                for (let i = start; i < text.length; i++) {
                    const char = text[i];

                    if (escapeNext) {
                        escapeNext = false;
                        continue;
                    }

                    if (char === '\\') {
                        escapeNext = true;
                        continue;
                    }

                    if (char === '"' && !inString) {
                        inString = true;
                    } else if (char === '"' && inString) {
                        inString = false;
                    } else if (!inString) {
                        if (char === '[') {
                            depth++;
                        } else if (char === ']') {
                            depth--;
                            if (depth === 0) {
                                end = i + 1;
                                candidates.push(text.substring(start, end));
                                break;
                            }
                        }
                    }
                }
            }
        }

        // Try to parse each candidate
        for (const candidate of candidates) {
            try {
                const parsed = JSON.parse(candidate);
                return {
                    success: true,
                    data: parsed,
                    rawJson: candidate
                };
            } catch (e) {
                continue;
            }
        }

        // If no valid JSON found and attempting fixes, try parsing the fixed response
        if (attemptFix && fixedResponse !== response) {
            try {
                const parsed = JSON.parse(fixedResponse);
                return {
                    success: true,
                    data: parsed,
                    rawJson: fixedResponse
                };
            } catch (e) {
                // Continue to error
            }
        }

        return {
            success: false,
            error: 'No valid JSON found',
            data: null,
            rawJson: null
        };

    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            data: null,
            rawJson: null
        };
    }
}

export default parseLLMJson;