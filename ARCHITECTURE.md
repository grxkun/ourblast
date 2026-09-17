# Conversational Terminal Architecture

## Overview
The Blast Terminal is a secure, wallet-verified conversational interface designed to bridge natural language interaction with the OURBLAST ecosystem. It serves as a unified command center for players, developers, and vault participants.

## Design System
- **Theme**: Inherits the "Dark Neon Arcade" design language.
- **Visuals**: Uses scanline effects, grid noise, and monospaced typography to evoke a retro-futuristic CLI.
- **Persona**: The AI Assistant acts as a technical navigator for the Blast Island ecosystem.

## Architecture Layers

### 1. Frontend (React / TanStack)
- **Terminal Component**: Manages input/output streams and visual state.
- **TerminalLine**: Presentational component for various message types (System, User, AI, Error, Command).
- **TerminalPrompt**: Handles command submission and focus management.
- **Real-time Hooks**: Integrates with `useBlast` for wallet state and TanStack Query for ecosystem data.

### 2. Command Processing
- **Local Dispatcher**: Handles client-side commands (`/help`, `/clear`) immediately for low latency.
- **Server Functions**: Complex queries (e.g., `/points`, `/vault`) are routed through TanStack Start server functions to interact with the database and Sui blockchain.

### 3. AI Integration Strategy
- **Natural Language Parsing**: User queries that aren't explicit commands are routed to an LLM provider (e.g., Anthropic Claude).
- **Context Injection**: The system injects ecosystem-specific context (e.g., treasury balance, player stats) into the AI prompt to ensure accurate, up-to-date responses.
- **Streaming**: AI responses are streamed using Server-Sent Events (SSE) for a responsive typing experience.

### 4. Security & Verification
- **Wallet Auth**: Commands affecting user assets require a valid Sui signature.
- **Rate Limiting**: Integrated with existing chat spam protection logic in `community.functions.ts`.
- **Payment Verification**: Actions requiring SUI (like global broadcasts) verify transaction IDs via `payments.server.ts`.

## Data Flow
1. User Input -> `TerminalPrompt`
2. Processing -> `Terminal.handleCommand`
3. Command Matching:
   - If Command (`/...`): Call specific API endpoint.
   - If Query: Route to AI backend with current state context.
4. Response -> `TerminalLine` (with type-writer animation for AI).
