# Jamaican Vibes Domino V3

Single-player remains local. Online mode is server-authoritative.

Added in V3:
- Home screen
- Online lobby with room code
- Four-player Ready system
- Host controls for Partner/Individual and target 6/10/12
- 90-second reconnect grace period with seat/token recovery
- Game pause while a player reconnects
- Leave Game
- Rematch voting
- Connected/disconnected indicators
- Game sounds + mute setting
- Hand/match history
- Clear live score banner
- Spectator mode with no access to hidden hands
- Rate limiting for excessive socket actions
- Server-only shuffle/deal, move validation, timers, scoring and blocked-game rules
- Private hands are sent only to the owning player until reveal
- Responsive mobile UI

Local run:
1. Install Node.js
2. npm install
3. npm start
4. Open http://localhost:3000

Production deployment:
Use a Node host with persistent WebSocket support. Start command: npm start.

Recommended pre-launch test matrix:
- 4 real phones/computers
- create/join/ready
- Partner and Individual
- timer expiry at 4+, 3 and 2 dominoes
- forced pass / multiple passes
- blocked win
- blocked tie -> 2-point next hand -> 6-6 poses
- partner poser choice
- disconnect/reconnect inside 90 seconds
- disconnect timeout / open seat
- rematch
- spectator joining before and during game
- iPhone portrait/landscape, Android, tablet, desktop


## V4 rule: Break & Start
Partner games now use Break & Start scoring:
- A team must win 6 consecutive hands to win the match.
- If the opposing team wins, the previous streak is "broke".
- The new winning team starts its own streak at 1.
- Example: Team A wins 1, then Team B wins. Team A's run is broken and Team B starts at 1; Team B's next win makes it 2.
- If a team is at 5 and the other team wins, the five-win streak is broken and the new team starts at 1.
- Partner target is fixed at 6 consecutive wins.


## V5 correction — BRUCK AND START / ONE-ONE PLAY TWO
Partner scoring now follows the corrected state machine:
- Start by playing for 1.
- Same team keeps winning: it goes 1, 2, 3, 4, 5, then 6 wins the game.
- If a team is already on 2 or more and the other team wins, that is BRUCK:
  the running score is cleared, and the next hand starts again playing for 1.
- If Team A goes 1 and Team B wins the next hand, it is ONE-ONE.
- ONE-ONE means the next hand is ONE-ONE PLAY TWO.
- Whoever wins ONE-ONE PLAY TWO becomes the team that has gone 2.
- The first team to go 6 wins.


## V6 — Offline Bruck & Start
The local/offline Partner game now uses the same Bruck & Start rules as online:
- First team to go 6 wins.
- Same team can go 1, 2, 3, 4, 5, 6.
- If the running team is on 2 or more and the other team wins, the run is BRUCK and the next hand starts playing for 1.
- If one team goes 1 and the other team wins the next hand, it is ONE-ONE.
- The following hand is ONE-ONE PLAY TWO.
- Whoever wins that hand goes 2.
- Existing blocked-tie behavior remains in place.

## V7 — Game-management rules
The in-game Rules panel now documents:
- 90-second disconnect/reconnect pause
- leaving an active match
- inactive/AFK behavior
- 10/12/15-second timer
- automatic pass
- server-validated legal moves
- winning-team poser choice
- blocked-tie 2-point / double-six poser rule
- private online hands
- lobby READY requirement and host controls
- host fairness
- match history
- spectators
- unanimous rematch voting

The core Bruck and Start / One-One Play Two scoring rules are unchanged.


## Render deployment
This folder is ready to deploy as a Render Web Service.

Settings:
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check: `/health`
- Server binds to `0.0.0.0` and uses Render's `PORT`
- WebSockets are handled by the same Node/Socket.IO service

Recommended deployment flow:
1. Put this folder in a GitHub, GitLab, or Bitbucket repository.
2. In Render, choose New > Web Service.
3. Connect the repository.
4. Render can read `render.yaml`, or enter `npm install` and `npm start` manually.
5. Deploy.
6. Open the assigned `onrender.com` URL on iPhone Safari.
7. Test Single Player first, then create an Online room and test four devices.

Important:
- The free Render service can spin down after inactivity.
- Active rooms are currently stored in server memory, so a server restart can end active rooms.
