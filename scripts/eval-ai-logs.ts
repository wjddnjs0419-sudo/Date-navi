import { createClient } from '@supabase/supabase-js';

const RUBRIC_VERSION = 'v1';
const JUDGE_MODEL = 'claude-sonnet-4-5'; // 생성 모델(claude-haiku-4-5)과 다른 모델을 써서 자기 편향을 줄인다.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANTHROPIC_API_KEY) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY');
  console.error('.env.eval.local.example을 참고해 .env.eval.local을 만든 뒤 npm run eval:ai-logs로 실행하세요.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const EVAL_SCHEMA = {
  type: 'object',
  properties: {
    relevance_score: { type: 'integer', enum: [1, 2, 3, 4, 5] },
    hallucination_flag: { type: 'boolean' },
    reasoning_quality_score: { type: 'integer', enum: [1, 2, 3, 4, 5] },
    verdict: { type: 'string', enum: ['pass', 'borderline', 'fail'] },
    comment: { type: 'string' },
  },
  required: ['relevance_score', 'hallucination_flag', 'reasoning_quality_score', 'verdict', 'comment'],
  additionalProperties: false,
};

type LogRow = {
  id: string;
  action: string;
  prompt: string;
  response_json: unknown;
  prompt_version: string;
};

type JudgeResult = {
  relevance_score: number;
  hallucination_flag: boolean;
  reasoning_quality_score: number;
  verdict: 'pass' | 'borderline' | 'fail';
  comment: string;
};

function parseArgs(argv: string[]): { action?: string; limit: number } {
  const args: { action?: string; limit: number } = { limit: 50 };
  for (const arg of argv) {
    if (arg.startsWith('--action=')) args.action = arg.slice('--action='.length);
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
  }
  return args;
}

async function fetchUnjudgedLogs(action: string | undefined, limit: number): Promise<LogRow[]> {
  const { data: judged, error: judgedError } = await supabase
    .from('ai_recommendation_log_evals')
    .select('log_id')
    .eq('rubric_version', RUBRIC_VERSION);
  if (judgedError) throw judgedError;
  const judgedIds = (judged ?? []).map((row: { log_id: string }) => row.log_id);

  let query = supabase
    .from('ai_recommendation_logs')
    .select('id, action, prompt, response_json, prompt_version')
    .eq('status', 'success')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (action) query = query.eq('action', action);
  if (judgedIds.length > 0) query = query.not('id', 'in', `(${judgedIds.join(',')})`);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as LogRow[];
}

function buildJudgePrompt(row: LogRow): string {
  return `당신은 데이트 추천 AI의 출력을 평가하는 채점자입니다.

[프롬프트]
${row.prompt}

[응답]
${JSON.stringify(row.response_json)}

다음 기준으로 채점하세요:
1. relevance_score (1-5): 프롬프트에 명시된 mood/budget/duration/자유 입력과 추천이 얼마나 맞는가.
2. hallucination_flag (true/false): 프롬프트에 없는 장소명·사실을 응답이 지어냈는가.
3. reasoning_quality_score (1-5): why_recommended가 구체적인가, 뻔한 말인가.
4. verdict: "pass" | "borderline" | "fail"
5. comment: 한 줄 코멘트`;
}

async function judge(row: LogRow): Promise<JudgeResult> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY as string,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'structured-outputs-2025-11-13',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      max_tokens: 512,
      temperature: 0,
      output_config: { format: { type: 'json_schema', schema: EVAL_SCHEMA } },
      messages: [{ role: 'user', content: buildJudgePrompt(row) }],
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Anthropic ${response.status}: ${detail}`);
  }
  const data = await response.json();
  const textBlock = (data.content ?? []).find((b: { type: string }) => b.type === 'text');
  const text: string = textBlock?.text ?? '';
  if (!text) throw new Error('Empty judge response');
  return JSON.parse(text) as JudgeResult;
}

async function main() {
  const { action, limit } = parseArgs(process.argv.slice(2));
  const rows = await fetchUnjudgedLogs(action, limit);
  console.log(`${rows.length}개 미채점 로그 발견 (action=${action ?? 'all'}, limit=${limit})`);

  let done = 0;
  let failed = 0;
  const scores: number[] = [];

  for (const row of rows) {
    try {
      const result = await judge(row);
      const { error } = await supabase.from('ai_recommendation_log_evals').insert({
        log_id: row.id,
        rubric_version: RUBRIC_VERSION,
        judge_model: JUDGE_MODEL,
        relevance_score: result.relevance_score,
        hallucination_flag: result.hallucination_flag,
        reasoning_quality_score: result.reasoning_quality_score,
        verdict: result.verdict,
        comment: result.comment,
      });
      if (error) throw error;
      scores.push(result.relevance_score);
      done += 1;
      console.log(`[${done + failed}/${rows.length}] ${row.id} (${row.action}) → ${result.verdict}, relevance=${result.relevance_score}`);
    } catch (err) {
      failed += 1;
      console.error(`[${done + failed}/${rows.length}] ${row.id} 채점 실패:`, err);
    }
  }

  const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : 'N/A';
  console.log(`완료: ${done}개 채점, ${failed}개 실패. 평균 relevance_score=${avg}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
