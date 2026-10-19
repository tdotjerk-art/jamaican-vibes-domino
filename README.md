# Jamaican Vibes Domino V3

Single-player remains local. Online mode is server-authoritative.

Added in V3:
- Home screen
- Online lobby with room code
- Four-player Ready system
- Host controls for Partner/Cut Throat and target 6/10/12
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
- Partner and Cut Throat
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

## Table voice chat

Seated online players can tap **Join Voice**, allow microphone access, and talk
with the other players who join voice in the same room (up to four people).
**Mute mic** silences outgoing audio. **Leave Voice** stops the microphone without
leaving the game. Leaving the game, closing the page, or losing the socket
connection stops microphone tracks and peer connections. Spectators are excluded.
No audio is recorded or stored by this application. Production requires HTTPS;
localhost works for development. A browser that blocks autoplay shows a
**Tap to hear players** button.

Voice uses WebRTC, with Socket.IO only carrying room-scoped signaling. For reliable
connections between mobile networks and restrictive Wi-Fi, configure an authenticated
TURN service in the host environment:

- `VOICE_TURN_URLS`: comma-separated `turn:` / `turns:` URLs from the provider.
- Either `VOICE_TURN_USERNAME` + `VOICE_TURN_CREDENTIAL` (provider credentials),
  or `VOICE_TURN_SECRET` (a coturn-compatible REST shared secret). The shared-secret
  option generates one-hour credentials and does not send the shared secret to browsers.

Without TURN configuration, voice attempts direct connections using STUN; some
network combinations will not connect. Do not describe cross-network calling as
verified until it is tested with real phones on separate networks. The browser
checks use synthetic microphone audio on local Chromium, not real iPhone microphones.

## Cut Throat — First to 6

Use **Cut Throat — First to 6** for a local game against three computer
players, or choose **Cut Throat — First to 6** when creating an online room.
Every player keeps an independent running score. Normal wins are worth one;
there is no bruck reset or partner poser selection. The first score to reach six
ends the match, and the display never exceeds six.

Before starting, choose the blocked-tie rule (a tie means two or more players share
the lowest pip count):

- **Play for 2 — double-six poses:** no points for the tied hand; on the next deal,
  the double-six holder automatically poses 6–6 and that hand is worth two points.
- **Play for 1 — previous hand winner poses:** no points for the tied hand; the last
  player who won a hand poses the next hand, which is worth one point. If the first
  hand ties before anyone has won, the double-six holder poses for one point.

A two-point win from five finishes at six, keeping the existing score ceiling.
The host selects the online tie rule before players ready up; it applies to the
whole room and stays selected for a rematch.


## Jamaican 3 Cards

Open `/three-cards.html`, or choose **Jamaican 3 Cards** on the home menu.
This is the owner's rank-matching card game, separate from Domino, without betting.
Use single-player against computers or create an online table for 2–4 players.
Online players must each select the same game count (multiples of five) and ready
up before the host starts. At the end they must unanimously choose the same
extension to continue with existing scores.

The 52-card deck is shuffled for every game. Highest dealer pick wins (Ace high;
highest ties repick). Deal three cards each; the next face-up card stays on the
table. Turning up a 6 or Jack awards the dealer one point per seated player.
Starting to the dealer's right, match the face-up rank with your own card and play
one companion card from your hand. That companion is the new rank to match.
A player can decline; priority rotates right. A last matching card plays alone
and wins. If the opening card goes unused, the second player to the dealer's
right draws next. Draws stay face up: the drawer has first choice, then others
in rotation. Subsequent unused draws advance to the right.

The hand winner gains one and everyone else loses one; the winner deals next.
Deck exhaustion is a counted draw with no hand points; the dealer keeps any
bonus and everyone picks again for the next dealer. Positive ending scores are
winners, negative scores are losses, and zero is even. Full rules are available
inside the card game.

Online rooms use a separate Socket.IO namespace, server-validated actions, private
hand views and a browser-held reconnect token. Play pauses while any seat is
disconnected. All card session state is in memory; process restarts lose it.
Single-player progress lasts for the current page only. Cross-device/iPhone
Safari play needs actual-device verification.

The card table uses a green oval felt with four seats around the rim. You sit at the bottom; opponents sit to the right, opposite, and left. Both the rules engine and online lobby enforce a maximum of four players.
