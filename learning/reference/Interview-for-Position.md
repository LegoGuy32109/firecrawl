Josh Hale and Rafael Miller - June 10 VIEW RECORDING: Meeting Purpose
Introductory chat to assess Josh Hale's fit for a Firecrawl Product Engineer role.
Key Takeaways
Strong Product Engineering Fit: Josh Hale's background at GEO (healthcare API) and his personal project, Open Dwarf, directly align with the role's needs. He has experience managing complex developer ecosystems, building RAG systems, and using Playwright for advanced web interaction.
Proactive Product Feedback: Hale provided specific, actionable feedback on Firecrawl's Interact API, including a request for more detailed error messages and a technical proposal to optimize the accessibility tree input for the LLM.
Firecrawl's "Defend Your Prototype" Model: Firecrawl's product process is highly agile. Engineers build prototypes and "defend" them in meetings to secure resources (e.g., scaling help from Mogary) for rapid development into full products, as exemplified by the Monitoring feature.
Interact Product Focus: The role is critical for the Interact product, which is currently under-resourced. The goal is to hire a dedicated engineer to stabilize the product, address customer feedback, and define its future direction.
Topics
Josh Hale's Background & Experience
Current Role (GEO): Product Engineer for a healthcare API.
Function: Standardizes data for aggregators (HHAX, SAN Data, TELUS) to ensure client payment.
Developer Experience: Manages a diverse client base (40+ interactions/quarter), from large agencies with developers to non-technical users.
Key Projects:
Flat File Importer: A web app for non-technical users to import data (Excel, CSV, JSON), mapping columns to GEO's system.
Internal RAG System: Built with Vercel AI to query company knowledge (Jira, Confluence), generating formatted Jira responses and visual mockups.
Personal Project (Open Dwarf): Multiplayer web game using WebRTC and WebGL2.
Advanced Playwright Use: Uses Playwright as a core tool for mod development.
Function: Generates scenarios in headless browsers → extracts replayable snapshots → creates video documentation with screenshots.
Purpose: Ensures mod changes render as expected for end-users.
Firecrawl's Product Engineering Model
Role Scope: A product engineer will own the full product cycle, from customer feedback to shipping.
"Defend Your Prototype" Process:
An engineer builds a simple prototype to solve a customer problem.
The prototype is presented in an engineering meeting to demonstrate its value.
If approved, a small team (3–4 engineers) is allocated for rapid development.
Example (Monitoring Feature): A prototype was scaled to 10M frames/day in one week, with scaling support from Mogary.
Codebase Management: Acknowledged technical debt ("waste") is expected for a fast-moving startup. Periodic cleanup projects (e.g., quarterly) are planned.
Interact Product State & Feedback
Current State: Under-resourced, with no dedicated full-time engineer.
Infrastructure: Runs on proprietary "bare metal" servers.
Focus: The company's primary focus is currently on the "Search" product.
Key Challenges:
Unpredictable behavior due to bot blockers.
Poor error messaging (e.g., generic 409s) that lacks actionable context for API users.
Hale's Technical Feedback:
Error Messaging: Requested more explicit error messages to aid debugging, specifying the exact point of failure in a replay.
Accessibility Tree Optimization: Proposed using the BrowserAgent's -C flag to remove non-interactable elements from the accessibility tree.
Rationale: Reduces the LLM's input size (from 40k+ to 100–400 chars), improving performance and reducing cost.
Further Idea: Use semantic ranking to prioritize relevant nodes for the LLM.
