# Agent prompts

AdPilot's analysis, summaries and recommendations are generated deterministically from data (see `agent/`), so they are testable and never hallucinate numbers.

This folder holds prompt templates for an optional LLM narrative layer (e.g. rewriting the executive summary in a house voice, or drafting creative refresh briefs). No LLM call is made anywhere in the app today; adding one must keep all figures sourced from the analysis snapshot.
