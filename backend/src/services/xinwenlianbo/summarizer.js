export async function summarize(transcript, config) {
  const prompt = `根据新闻联播转录提取主要新闻标题和摘要。
优先参考节目开头的内容提要，并用正文核对人名、地名、机构和数字。
按照播出顺序为每条主要新闻写一个独立、可直接播读的标题。保留关键事实，合并重复报道，
去掉问候、栏目提示、转场和天气等内容。遇到听写含糊的信息时保留能确认的事实。
摘要用一段话概括主要内容，控制在 300 个汉字以内。
仅输出 JSON 对象，格式为 {"headlines":["标题1","标题2"],"summary":"摘要"}。

转录文字：
${transcript}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '';
    const json = content.match(/\{[\s\S]*\}/)?.[0];
    if (!json) throw new Error('摘要服务未返回 JSON 对象');
    return JSON.parse(json);
  } finally {
    clearTimeout(timeoutId);
  }
}
