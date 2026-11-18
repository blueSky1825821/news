export async function summarize(transcript, config) {
  const prompt = `以下是一段新闻联播的完整转录文字，请：
1. 列出今日主要新闻标题（JSON 数组格式）
2. 生成一段 300 字以内的概要
3. 输出格式：{"headlines": ["标题1", "标题2", ...], "summary": "概要..."}

转录文字：
${transcript}`;

  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })
  });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  try {
    return JSON.parse(content);
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {}
    }
    return {
      headlines: [],
      summary: transcript.slice(0, 500)
    };
  }
}
