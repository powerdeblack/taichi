# Work in progress (not live)

`team-wide-rules.patch` holds the new rules from the design brief, parked
until the final numbers are chosen (see the simulator results in the chat):

- active Defense/Heal cards hit the whole team (Reverse Heal the whole enemy
  team); Secrets and Thorns stay single-target;
- attack base damage = 20% of a fixed reference Tank HP (166 -> floor 33)
  times each card's power (>= 1);
- +5 flat attack points per attack card instead of +15%;
- Heal cards give +2 energy; attacks cost energy.

Apply with `git apply wip/team-wide-rules.patch` (it does not change the
live game until applied, tuned and pushed).
