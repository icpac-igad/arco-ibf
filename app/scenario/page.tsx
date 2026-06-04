import React from 'react';
import Link from 'next/link';
import { listScenarios } from 'app/lib/scenario/registry';

/**
 * Scenario Mode index — lists the available event simulations.
 * Reached from the Risk Decisions stage launcher, or directly at /scenario.
 */
export default function ScenarioIndexPage() {
  const scenarios = listScenarios();

  return (
    <section className='grid-row margin-top-4'>
      <div className='tablet:grid-col-12'>
        <p className='eyebrow'>CRMA · Risk Decisions</p>
        <h1>Scenario Simulation</h1>
        <p className='text-base'>
          Replay a past event as if it were unfolding today. Read the evidence as it
          arrives, weigh the uncertainty, and make a defensible DOC decision. This is
          not a test of predicting the disaster — deciding <em>not</em> to act, with
          reasons, can be the right call.
        </p>

        <ul className='usa-card-group margin-top-3'>
          {scenarios.map((s) => (
            <li key={s.event_id} className='usa-card tablet:grid-col-6'>
              <div className='usa-card__container'>
                <div className='usa-card__header'>
                  <h3 className='usa-card__heading'>{s.title}</h3>
                </div>
                <div className='usa-card__body'>
                  <p>
                    <strong>{s.hazard}</strong> · {s.country} — {s.admin1}
                  </p>
                  <p className='text-base-dark'>
                    Signal: {s.forecastability} · starts {s.simulation_start.offset_label}
                  </p>
                </div>
                <div className='usa-card__footer'>
                  <Link className='usa-button' href={`/scenario/${s.event_id}`}>
                    Start simulation
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
