# NPC Invaders

Every room where energy is mined has an inner counter at approximately **100,000 units of mined energy** (plus some random variable). After this counter times out, a new game-controlled creep appears at one of the room exits with the goal of hunting your creeps. It will not touch your structures most of the time, but if a structure gets on its way, it will try to destroy it. This creep can use [`attack`](https://docs.screeps.com/api/#Creep.attack), [`rangedAttack`](https://docs.screeps.com/api/#Creep.rangedAttack), and [`dismantle`](https://docs.screeps.com/api/#Creep.dismantle). It is unable to move between rooms.

![](https://raw.githubusercontent.com/screeps/docs/c7cb981eba13bd6c3c4a3ea274851326d74a506f/source/img/invader.png)

An important feature of these creeps is that they can appear only at **exits to neutral rooms**. If the target room is under your (or someone else’s) control or it is a reserved room, an invader creep will never appear at this exit. If all exits in the room are of this kind, invaders cannot appear at all.

Currently, NPC invaders attacks do not generate any e-mail notifications, since generally they appear several times a day even in a single room if it's being actively harvested.

## Raids

There is a 10% chance that you will get not only a lone Invader but a whole company of them, from 2 to 5. Each Invader has its own role: melee attacker, ranged attacker, or healer. Ranged attackers are different from melee ones in their behavior: they try to stay at a distance from your creeps. The function of healers is evidently to heal other raid members. Also, some creeps may be boosted with ![](https://static.screeps.com/upload/mineral-icons/UH.png), ![](https://static.screeps.com/upload/mineral-icons/KO.png), ![](https://static.screeps.com/upload/mineral-icons/LO.png), ![](https://static.screeps.com/upload/mineral-icons/ZH.png), or ![](https://static.screeps.com/upload/mineral-icons/GO.png).

## Invader creep types

There are two sizes of invader creeps:

*   Light creeps that appear in neutral, reserved, and claimed rooms up to level 3.
*   Heavy creeps that appear in claimed rooms level 4 and above.

|  | RCL < 4 | RCL ≥ 4 |
| --- | --- | --- |
| Melee | ![](https://raw.githubusercontent.com/screeps/docs/c7cb981eba13bd6c3c4a3ea274851326d74a506f/source/img/smallMelee.png) | ![](https://raw.githubusercontent.com/screeps/docs/c7cb981eba13bd6c3c4a3ea274851326d74a506f/source/img/bigMelee.png) |
| Ranged | ![](https://raw.githubusercontent.com/screeps/docs/c7cb981eba13bd6c3c4a3ea274851326d74a506f/source/img/smallRanged.png) | ![](https://raw.githubusercontent.com/screeps/docs/c7cb981eba13bd6c3c4a3ea274851326d74a506f/source/img/bigRanged.png) |
| Healer | ![](https://raw.githubusercontent.com/screeps/docs/c7cb981eba13bd6c3c4a3ea274851326d74a506f/source/img/smallHealer.png) | ![](https://raw.githubusercontent.com/screeps/docs/c7cb981eba13bd6c3c4a3ea274851326d74a506f/source/img/bigHealer.png) |

## Testing

Note that you can use "Invasion" controls in the room side panel in order to create NPC invaders manually and test your defences.

![](https://raw.githubusercontent.com/screeps/docs/c7cb981eba13bd6c3c4a3ea274851326d74a506f/source/img/chrome_2016-11-24_14-55-59.png)

## Strongholds

If invaders started raiding your rooms, check your map sector &mdash; there will be their home base somewhere.
This NPC Stronghold can be attacked and destroyed, which will cause invaders to stop appearing in your rooms until the next stronghold spawns.

Each NPC Stronghold has the `EFFECT_COLLAPSE_TIMER` on every structure. A new stronghold will appear somewhere in the sector almost immediately after the previous one has collapsed.
If you destroy the stronghold, its ruins will remain with the same effect timer which gives you some invader-free time.

There are many stronghold types. Each type has different structures layout and defenders AI.
You can estimate stronghold's difficulty by checking the `level` property on the [`StructureInvaderCore`](https://docs.screeps.com/api/#StructureInvaderCore).

![](https://raw.githubusercontent.com/screeps/docs/c7cb981eba13bd6c3c4a3ea274851326d74a506f/source/img/stronghold1.png) ![](https://raw.githubusercontent.com/screeps/docs/c7cb981eba13bd6c3c4a3ea274851326d74a506f/source/img/stronghold5.png)

There is one more reason to conquer an NPC Stronghold &mdash; it contains resources in its treasury.
Every stronghold has a few containers, and the core structure ruin also will contain resources after you destroy it.
Here is an example of a level 5 stronghold loot:

![](https://raw.githubusercontent.com/screeps/docs/c7cb981eba13bd6c3c4a3ea274851326d74a506f/source/img/stronghold_loot5.png) ![](https://raw.githubusercontent.com/screeps/docs/c7cb981eba13bd6c3c4a3ea274851326d74a506f/source/img/stronghold_loot1.png) ![](https://raw.githubusercontent.com/screeps/docs/c7cb981eba13bd6c3c4a3ea274851326d74a506f/source/img/stronghold_loot2.png) ![](https://raw.githubusercontent.com/screeps/docs/c7cb981eba13bd6c3c4a3ea274851326d74a506f/source/img/stronghold_loot3.png) ![](https://raw.githubusercontent.com/screeps/docs/c7cb981eba13bd6c3c4a3ea274851326d74a506f/source/img/stronghold_loot4.png)

An active NPC Stronghold not only spawns invader creeps in the sector but also spawns lesser cores in neutral (even reserved) rooms of the sector every few thousands of ticks.
Such cores will not have any structures or creeps, but will reserve the controller so that you cannot harvest energy in this room without destroying the core first.

![](https://raw.githubusercontent.com/screeps/docs/c7cb981eba13bd6c3c4a3ea274851326d74a506f/source/img/invader-core-expand.gif)
