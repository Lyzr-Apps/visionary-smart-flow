function parseLLMJson(response: string, options: any = {}): any {
    const {
        attemptFix = true,
        maxBlocks = 5,
        preferFirst = true,  // Prefer first valid JSON found
        allowPartial = false // Allow partial/truncated JSON
    } = options;

    // Validate input
    if (!response || typeof response !== 'string') {
        return {
            success: false,
            error: 'Invalid input: response must be a non-empty string',
            data: null,
            rawJson: null
        };
    }

    // Cache for performance
    const jsonCache = new Map();

    // Enhanced JSON fixing function
    const fixCommonJsonIssues = (jsonStr: string) => {
        // Check cache first
        if (jsonCache.has(jsonStr)) {
            return jsonCache.get(jsonStr);
        }

        let fixed = jsonStr;
        const original = jsonStr;

        // Fix simple closing brace issues
        if (fixed.indexOf('\n')> -1) {
            // Multi-line: check if it ends without closing
            if (!fixed.trim().endsWith('}') && !fixed.trim().endsWith(']')) {
                // Attempt to find matching brace
                const braceCount = (fixed.match(/{/g) || []).length;
                const braceCloseCount = (fixed.match(/}/g) || []).length;
                if (braceCount > braceCloseCount) {
                    fixed += '}';
                }

                const bracketCount = (fixed.match(/\[/g) || []).length;
                const bracketCloseCount = (fixed.match(/\]/g) || []).length;
                if (bracketCount > bracketCloseCount) {
                    fixed += ']';
                }
            }
        } else {
            // Single line - might be truncated
            const trimmed = fixed.trim();
            if (trimmed.startsWith('{') && !trimmed.endsWith('}') && attemptFix) {
                // Try to find the end of the object
                let cleaned = trimmed + '}'; // Simple fix first
                fixed = cleaned;
            }
            if (trimmed.startsWith('[') && !trimmed.endsWith(']') && attemptFix) {
                fixed = trimmed + ']';
            }
        }

        // Fix trailing commas
        fixed = fixed.replace(/,(\s*[}\]])/g, '$1');

        // Fix unescaped quotes
        fixed = fixed.replace(/(?<!\\)"/g, '\"');

        // Cache result
        jsonCache.set(original, fixed);
        return fixed;
    };

    // Enhanced JSON extraction
    const extractJson = (text: string) => {
        const results: any[] = [];

        // Priority 1: Look for code blocks with json marker
        const jsonBlockPattern = /```(?:json|JSON)\s*\n?([\s\S]*?)\n?```/g;
        let match;
        while ((match = jsonBlockPattern.exec(text)) !== null && results.length < maxBlocks) {
            results.push({
                type: 'block',
                content: match[1].trim(),
                position: match.index
            });
        }

        // Priority 2: Look for standard code blocks
        const codeBlockPattern = /```([\s\S]*?)```/g;
        while ((match = codeBlockPattern.exec(text)) !== null && results.length < maxBlocks) {
            const content = match[1].trim();
            if (!jsonBlockPattern.test(text)) {
                results.push({
                    type: 'code',
                    content: content,
                    position: match.index
                });
            }
        }

        // Priority 3: Look for JSON-like structures in plain text
        let jsonLikePattern = /{[^{}]}/g;
        while ((match = jsonLikePattern.exec(text)) !== null && results.length < maxBlocks) {
            results.push({
                type: 'inline',
                content: match[0],
                position: match.index
            });
        }

        // Priority 4: Look for arrays
        jsonLikePattern = /\[[^\[\]]\]/g;
        while ((match = jsonLikePattern.exec(text)) !== null && results.length < maxBlocks) {
            results.push({
                type: 'array',
                content: match[0],
                position: match.index
            });
        }

        // Sort by position in text
        results.sort((a, b) => a.position - b.position);

        return results.map(r => r.content);
    };

    // Smart JSON boundary detection
    const findJsonBoundaries = (text: string) => {
        let start = -1;
        let end = -1;
        let depth = 0;
        let inString = false;
        let escapeNext = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            if (escapeNext) {
                escapeNext = false;
                continue;
            }

            if (char === '\"' && !inString) {
                inString = true;
                if (start === -1) start = i;
            } else if (char === '\"' && inString) {
                inString = false;
            } else if (char === '\\') {
                escapeNext = true;
            } else if (!inString) {
                if (char === '{' || char === '[') {
                    if (depth === 0) {
                        start = start === -1 ? i : start;
                    }
                    depth++;
                } else if (char === '}' || char === ']') {
                    depth--;
                    if (depth === 0) {
                        end = i + 1;
                        return { start, end };
                    }
                }
            }
        }

        return { start, end: end === -1 ? text.length : end };
    };

    // Find valid JSON in text
    const extractValidJson = (text: string) => {
        if (text.trim().length < 2) return [];

        const { start, end } = findJsonBoundaries(text);
        if (start !== -1 && end !== -1 && start < end) {
            return [text.substring(start, end)];
        }

        // Fallback: extract potential JSON segments
        const segments = [];
        let current = "";
        let braceCount = 0;
        let bracketCount = 0;
        let inString = false;
        let escapeNext = false;

        for (const char of text) {
            if (escapeNext) {
                current += char;
                escapeNext = false;
                continue;
            }

            if (char === '\\') {
                escapeNext = true;
                current += char;
                continue;
            }

            if (char === '\"' && !inString) {
                inString = true;
                current += char;
            } else if (char === '\"' && inString) {
                inString = false;
                current += char;
            } else if (!inString) {
                if (char === '{' || char === '[') {
                    if (current === "" || current.endsWith(',')) {
                        segments.push(current);
                        current = "";
                    }
                    braceCount++;
                    bracketCount += (char === '[' ? 1 : 0);
                    current += char;
                } else if (char === '}' || char === ']') {
                    current += char;
                    braceCount--;
                    bracketCount -= (char === ']' ? 1 : 0);
                    if (braceCount === 0 && bracketCount === 0) {
                        segments.push(current);
                        current = "";
                    }
                } else {
                    current += char;
                }
            } else {
                current += char;
            }
        }

        if (current.trim()) segments.push(current);
        return segments.filter(s => s.trim().length > 0);
    };

    // Enhanced parsing attempt
    const tryParseJson = (jsonStr: string) => {
        if (!jsonStr || jsonStr.trim().length === 0) {
            return { success: false, data: null, error: 'Empty JSON string' };
        }

        let attempts = 0;
        let current = jsonStr.trim();

        // Try original first
        try {
            const parsed = JSON.parse(current);
            const unwrapped = unwrapResponse ? unwrapResponse(parsed) : parsed;
            return {
                success: true,
                data: unwrapped,
                rawJson: current
            };
        } catch (e) {
            attempts++;
        }

        // Try with fixes
        if (attemptFix) {
            // Try fixing common issues
            current = fixCommonJsonIssues(current);
            try {
                const parsed = JSON.parse(current);
                const unwrapped = unwrapResponse ? unwrapResponse(parsed) : parsed;
                return {
                    success: true,
                    data: unwrapped,
                    rawJson: current
                };
            } catch (e) {
                // Continue to next approach
            }

            // Try finding complete JSON structure
            const extracted = extractValidJson(current);
            if (extracted.length > 0) {
                current = extracted[0];
                try {
                    const parsed = JSON.parse(current);
                    const unwrapped = unwrapResponse ? unwrapResponse(parsed) : parsed;
                    return {
                        success: true,
                        data: unwrapped,
                        rawJson: current
                    };
                } catch (e) {
                    // Continue
                }
            }

            // Try truncating gracefully if too long
            if (allowPartial && current.length > 1000) {
                let tryIndex = Math.floor(current.length * 0.8);
                while (tryIndex > 100 && attempts<3) {
                    const truncated = current.substring(0, tryIndex);
                    const completed = tryCompleteJson(truncated);
                    try {
                        const parsed = JSON.parse(completed.json);
                        // Validate it's not too broken
                        if (completed.valid || Object.keys(parsed).length>0) {
                            const unwrapped = unwrapResponse ? unwrapResponse(parsed) : parsed;
                            return {
                                success: true,
                                data: unwrapped,
                                rawJson: completed.json
                            };
                        }
                    } catch (e) {
                        // Try shorter
                        tryIndex = Math.floor(tryIndex * 0.9);
                        attempts++;
                    }
                }
            }
        }

        return { success: false, data: null, error: 'Failed to parse JSON after '+attempts+' attempts' };
    };

    // Try to complete truncated JSON
    const tryCompleteJson = (partialJson: string) => {
        let attempt = partialJson.trim();

        // Try to find the last structural element
        let lastBrace = Math.max(attempt.lastIndexOf('{'), attempt.lastIndexOf('['));
        let lastColon = attempt.lastIndexOf(':');
        let lastQuote = Math.max(attempt.lastIndexOf('\"'), attempt.lastIndexOf(\"'\"));
        let lastComma = attempt.lastIndexOf(',');

        if (lastBrace === -1) {
            return { json: attempt, valid: false };
        }

        // Try balanced braces approach
        try {
            // Find the last JSON element
            let balanced = attempt.substring(0, lastBrace);

            // Simple completion strategy
            if (attempt.indexOf('{') !== -1 && attempt.indexOf('[') === -1) {
                // Appears to be an object
                balanced += '}}';
            } else if (attempt.indexOf('[') !== -1 && attempt.indexOf('{') === -1) {
                // Appears to be an array
                balanced += ']}';
            } else {
                // Mixed - try closing braces
                balanced += '}';
            }

            // Try to validate by parsing
            try {
                JSON.parse(balanced);
                return { json: balanced, valid: true };
            } catch (e) {
                // Fallback: simpler completion
                return { json: balanced, valid: false };
            }
        } catch (e) {
            return { json: attempt, valid: false };
        }
    };

    // Main processing
    try {
        const unwrapResponse = (obj: any) => obj;
        let candidates = extractJson(response);

        // If no code blocks found, try extracting from plain text
        if (candidates.length === 0) {
            candidates.push(...extractValidJson(response));
        }

        // Remove duplicates
        const uniqueCandidates = [...new Set(candidates)];

        // Try each candidate
        for (const jsonStr of uniqueCandidates) {
            const result = tryParseJson(jsonStr);
            if (result.success) {
                return {
                    success: true,
                    data: result.data,
                    rawJson: result.rawJson
                };
            }
        }

        // If none work, try fixing the response first
        if (attemptFix) {
            const fixedResponse = fixCommonJsonIssues(response);
            const fixedCandidates = extractJson(fixedResponse);
            for (const jsonStr of fixedCandidates) {
                const result = tryParseJson(jsonStr);
                if (result.success) {
                    return {
                        success: true,
                        data: result.data,
                        rawJson: result.rawJson
                    };
                }
            }
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred in parseLLMJson',
            data: null,
            rawJson: null
        };
    }

    return {
        success: false,
        data: null,
        error: 'No valid JSON found in the response',
        rawJson: null
    };
}

// Export for ES modules
export default parseLLMJson;