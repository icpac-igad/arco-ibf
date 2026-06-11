import type { DisasterType } from 'app/types/emdat';

/**
 * Act I quiz — the evidence-elicitation layer of the three-act scenario flow
 * (design: cmra/quiz/quiz_templates.md + quiz_reorient_three_Acts.md).
 *
 * One generic template for all events: the same 8 questions for every drought
 * and flood scenario (only the option wording varies by hazard), plus a 9th
 * "model trust" seed question whose payoff lands in the Act III debrief
 * (cmra/quiz/3act-refinement3.md). The event-specific content is the evidence
 * cards the scenario already carries — the quiz never needs per-event authoring.
 *
 * Quiz → evidence classification → confidence → (Act II) BN update → DOC decision.
 * Q7/Q8 capture the participant's pre-BN risk estimate + DOC call so Act III can
 * compare them against the engine's risk indication. Formative — never scored.
 */

export interface QuizQuestion {
  id: string;
  prompt: string;
  /** Hazard-specific examples shown under the prompt. */
  hint?: string;
  options: string[];
  /** What this answer feeds in the BN — surfaced so participants see that every
   *  answer is an input to the machinery, not a knowledge test. */
  bn_purpose: string;
}

/** Participant's Act I answers, keyed by question id. */
export type ActOneAnswers = Record<string, string>;

export const Q_RISK = 'q7_risk_level';
export const Q_DOC = 'q8_doc_status';
export const Q_MODEL_TRUST = 'q9_model_trust';

export function getActOneQuiz(hazard: DisasterType): QuizQuestion[] {
  const flood = hazard === 'flood';
  return [
    {
      id: 'q1_strongest_evidence',
      prompt: 'What is the strongest evidence currently available?',
      hint: flood
        ? 'e.g. ensemble rainfall forecast · observed rainfall · river level · community report'
        : 'e.g. seasonal forecast · SPI anomaly · vegetation anomaly · field assessment',
      options: ['Forecast', 'Observation', 'Community report', 'Historical analogue'],
      bn_purpose: 'Determines which BN node receives the highest weight.',
    },
    {
      id: 'q2_classify_evidence',
      prompt: 'Classify that evidence.',
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
      prompt: 'What hazard condition does this evidence support?',
      options: flood
        ? ['Heavy rainfall', 'River flooding', 'Flash flooding', 'No hazard']
        : ['Meteorological drought', 'Agricultural drought', 'Hydrological drought', 'No hazard'],
      bn_purpose: 'Updates the hazard node.',
    },
    {
      id: 'q5_impact_pathway',
      prompt: 'Which impact pathway is most likely?',
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
    {
      id: Q_RISK,
      prompt: 'Your current risk estimate — before the model runs?',
      options: ['Low', 'Moderate', 'High', 'Very High'],
      bn_purpose:
        'Your pre-BN estimate. Act III compares it against the engine risk indication.',
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
