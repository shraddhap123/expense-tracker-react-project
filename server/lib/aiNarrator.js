const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
const OPENAI_MODEL = process.env.OPENAI_MODEL?.trim() || 'gpt-5.5';

export function canGenerateCoachNarrative() {
  return Boolean(OPENAI_API_KEY);
}

export async function generateCoachNarrative(input) {
  if (!canGenerateCoachNarrative()) {
    return { text: null, model: null };
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      reasoning: { effort: 'minimal' },
      instructions: [
        'You are a concise monthly money coach.',
        'Use only the provided summary facts.',
        'Do not invent numbers, transactions, or recommendations.',
        'Write four short labeled lines: Changed, Good, Watch, Action.',
        'Keep the tone supportive and specific.',
      ].join(' '),
      input: JSON.stringify(input),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || payload.error || 'OpenAI narrative request failed');
  }

  return {
    text: payload.output_text?.trim() || null,
    model: OPENAI_MODEL,
  };
}
