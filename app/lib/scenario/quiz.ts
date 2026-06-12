import type { Scenario, ScenarioQuizQuestion } from 'app/types/scenario';

/**
 * Act I quiz — the evidence-elicitation layer of the three-act scenario flow
 * (design: cmra/quiz/quiz_templates.md + quiz_reorient_three_Acts.md).
 *
 * One generic template for all events ("the quiz remains identical — only the
 * underlying evidence changes", quiz_templates.md), but **bound to the event**:
 * hints list the scenario's own round-1 evidence cards and name its actual
 * forecast system, so every event's quiz reads event-specific with zero
 * per-event authoring. On top of that, a scenario JSON may carry `act1_quiz` —
 * event-specific questions (authored from the event's RK storyline MDX,
 * app/content/events/rk/, outcome-free sections only) inserted before the
 * pre-BN risk/DOC commit.
 *
 * Opens with two forecast-literacy questions (deterministic vs ensemble, for
 * general participants — they explain WHY forecasts enter the BN as soft
 * evidence), then the 8 template questions, then a "model trust" seed question
 * whose payoff lands in the Act III debrief (cmra/quiz/3act-refinement3.md).
 *
 * Quiz → evidence classification → confidence → (Act II) BN update → DOC decision.
 * Q7/Q8 capture the participant's pre-BN risk estimate + DOC call so Act III can
 * compare them against the engine's risk indication. Formative — never scored;
 * `correct` only drives the revealed teaching note.
 */

export type QuizQuestion = ScenarioQuizQuestion;

/** Participant's Act I answers, keyed by question id. */
export type ActOneAnswers = Record<string, string>;

export const Q_RISK = 'q7_risk_level';
export const Q_DOC = 'q8_doc_status';
export const Q_MODEL_TRUST = 'q9_model_trust';

/** The evidence cards revealed in round 1 — what the participant can actually
 *  see while answering the quiz. */
function roundOneCardList(scenario: Scenario): string {
  const ids = new Set(scenario.rounds[0]?.reveal_evidence ?? []);
  return scenario.evidence_cards
    .filter((c) => ids.has(c.id))
    .map((c) => c.label)
    .join(' · ');
}

export function getActOneQuiz(scenario: Scenario): QuizQuestion[] {
  const flood = scenario.hazard === 'flood';
  const cardList = roundOneCardList(scenario);
  const eps = flood
    ? 'the ECMWF ensemble (many parallel model runs, updated daily)'
    : 'the SEAS5 seasonal ensemble (25 parallel model runs, monthly)';

  const literacy: QuizQuestion[] = [
    {
      id: 'q0a_deterministic',
      prompt: `The rainfall outlook for ${scenario.admin1} comes from ${eps}. First, the basics: what is a DETERMINISTIC forecast?`,
      options: [
        'A single model run giving one outcome — no range of possibilities',
        'Many model runs combined into probabilities',
        'A forecast that is always correct',
        'An observation of what has already happened',
      ],
      correct: 'A single model run giving one outcome — no range of possibilities',
      answer_note:
        'A deterministic forecast is ONE run of ONE model: one starting state, one outcome ("60 mm of rain on Thursday"). It says nothing about how confident to be in that number.',
      bn_purpose: 'Forecast literacy — why a single number is not enough for risk decisions.',
    },
    {
      id: 'q0b_ensemble',
      prompt: 'And what is an ENSEMBLE prediction system (EPS)?',
      options: [
        'The same model run many times from slightly different starting conditions, giving a spread of outcomes',
        'Several forecasters voting on the most likely outcome',
        'One model run at a higher resolution',
        'An average of past observed seasons',
      ],
      correct:
        'The same model run many times from slightly different starting conditions, giving a spread of outcomes',
      answer_note:
        'The atmosphere is chaotic — tiny starting differences grow, so the model is run ~25–50 times with slightly perturbed starts. The SPREAD of members is the uncertainty: "40% of members exceed the flood threshold" is information no single run can give. That is why forecast evidence enters the BN as SOFT evidence (a probability vector, not a fact) — and why the ensemble MEAN can look benign while a few TAIL members carry the real warning.',
      bn_purpose: 'Why forecasts are SOFT evidence in the BN — the spread is the confidence.',
    },
  ];

  const template: QuizQuestion[] = [
    {
      id: 'q1_strongest_evidence',
      prompt: 'What is the strongest evidence currently available?',
      hint: cardList
        ? `On your desk this round: ${cardList}`
        : flood
          ? 'e.g. ensemble rainfall forecast · observed rainfall · river level · community report'
          : 'e.g. seasonal forecast · SPI anomaly · vegetation anomaly · field assessment',
      options: ['Forecast', 'Observation', 'Community report', 'Historical analogue'],
      bn_purpose: 'Determines which BN node receives the highest weight.',
    },
    {
      id: 'q2_classify_evidence',
      prompt: 'Classify that evidence.',
      hint: cardList ? `Check the tags on the evidence cards: ${cardList}` : undefined,
      options: ['Hard', 'Soft', 'Virtual'],
      bn_purpose:
        'Determines confidence weighting — hard = observation (one-hot), soft = probability vector, virtual = likelihood message.',
    },
    {
      id: 'q3_reliability',
      prompt: 'How reliable is this evidence?',
      options: ['Very Low', 'Low', 'Moderate', 'High', 'Very High'],
      bn_purpose: 'Evidence likelihood weighting.',
    },
    {
      id: 'q4_hazard_condition',
      prompt: `What hazard condition does this evidence support in ${scenario.admin1}, ${scenario.country}?`,
      options: flood
        ? ['Heavy rainfall', 'River flooding', 'Flash flooding', 'No hazard']
        : ['Meteorological drought', 'Agricultural drought', 'Hydrological drought', 'No hazard'],
      bn_purpose: 'Updates the hazard node.',
    },
    {
      id: 'q5_impact_pathway',
      prompt: 'Which impact pathway is most likely here?',
      hint: scenario.brief_outcome_free,
      options: flood
        ? ['Population displacement', 'Road disruption', 'Crop loss', 'Water contamination']
        : ['Crop stress', 'Water shortage', 'Livestock stress', 'Food insecurity'],
      bn_purpose: 'Updates the impact node.',
    },
    {
      id: 'q6_next_evidence',
      prompt: 'What evidence would you request next?',
      options: [
        'Satellite observations',
        'Gauge observations',
        'Hydrological model',
        'Field assessment',
        'Exposure information',
      ],
      bn_purpose:
        'Real DOC operations seek more evidence — watch which cards the Act II rounds reveal.',
    },
  ];

  const commit: QuizQuestion[] = [
    {
      id: Q_RISK,
      prompt: 'Your current risk estimate — before the model runs?',
      options: ['Low', 'Moderate', 'High', 'Very High'],
      bn_purpose: 'Your pre-BN estimate. Act III compares it against the engine risk indication.',
    },
    {
      id: Q_DOC,
      prompt: 'Recommended DOC status — commit now, before seeing the BN output.',
      options: ['Monitor', 'Watch', 'Warning', 'Emergency Coordination'],
      bn_purpose: 'Your pre-BN decision. Act III compares it against the CRMA state.',
    },
    {
      id: Q_MODEL_TRUST,
      prompt:
        'The risk model you are about to work with was built from expert rules, not calibrated against decades of events. How much should you trust it?',
      options: [
        'Fully — it computes probabilities',
        'Not at all — rules are subjective',
        'As a transparent colleague — consistent and inspectable, but encoded judgment',
      ],
      bn_purpose: 'Hold this question. Act III returns to it.',
    },
  ];

  // Event-specific questions (scenario JSON `act1_quiz`) sit between the generic
  // evidence questions and the pre-BN commit, so they inform the estimate.
  return [...literacy, ...template, ...(scenario.act1_quiz ?? []), ...commit];
}

export function quizComplete(questions: QuizQuestion[], answers: ActOneAnswers): boolean {
  return questions.every((q) => Boolean(answers[q.id]));
}

/** "Your answers generated: …" — the evidence inventory carried into Act II. */
export function inventoryLines(questions: QuizQuestion[], answers: ActOneAnswers): string[] {
  const short: Record<string, string> = {
    q1_strongest_evidence: 'Strongest evidence',
    q2_classify_evidence: 'Evidence class',
    q3_reliability: 'Reliability',
    q4_hazard_condition: 'Hazard condition',
    q5_impact_pathway: 'Impact pathway',
    q6_next_evidence: 'Next evidence request',
    [Q_RISK]: 'Your risk estimate',
    [Q_DOC]: 'Your DOC status',
  };
  return questions
    .filter((q) => short[q.id] && answers[q.id])
    .map((q) => `${short[q.id]} = ${answers[q.id]}`);
}
