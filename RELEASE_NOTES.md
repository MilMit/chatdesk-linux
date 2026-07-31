# ChatDesk Linux v0.6.1

This maintenance release focuses on long Thinking responses and interrupted streams.

## Highlights

- keeps ChatGPT timers active while the window is backgrounded
- temporarily prevents Linux from suspending ChatDesk during active long-response POST streams
- waits through transient renderer stalls instead of replacing ChatGPT with a crash screen
- provides **Recover Current Chat** without switching conversations
- adds stream errors and protection state to Diagnostics

The recovery action reloads the same conversation URL so a response completed on the server can be fetched without changing chats. It does not inspect, store, or modify conversation content.
