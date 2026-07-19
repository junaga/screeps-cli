# Power

Power is an end-game mechanic opening a whole new trek in the development of your colony: towards increasing its effectiveness rather than the size of colonized territory. This is how its contents look like:

* You mine a special resource called “power.”

* Mined resource is processed in 8-level rooms and increase your account Global Power Level (GPL).

* GPL allows for creation of Power Creeps - special hero units - and development their levels and skills.

## Power Banks

![](https://raw.githubusercontent.com/screeps/docs/c7cb981eba13bd6c3c4a3ea274851326d74a506f/source/img/power_banks.gif)

Power can be gathered from structures called [Power Banks](https://docs.screeps.com/api/#StructurePowerBank) that appear from time to time in neutral empty rooms that divide living sectors on the map. Each Power Bank contains a random amount of power that can be obtained by destroying the structure. Due to the high-energy nature of these structures, 50% of damage applied to them bounce back to the attacking creep, so take care to have healers in your team.

You can also buy power from market, either from NPC traders or other players.

## Global Power Level

![](https://raw.githubusercontent.com/screeps/docs/c7cb981eba13bd6c3c4a3ea274851326d74a506f/source/img/gpl.png)

An 8-level room gives access to the structure called [Power Spawn](https://docs.screeps.com/api/#StructurePowerSpawn). It allows to execute the method [`StructurePowerSpawn.processPower`](https://docs.screeps.com/api/#StructurePowerSpawn.processPower). By merging 1 unit of power resource with 50 units of energy, you can increase your **Global Power Level** progress. On reaching a new GPL level, you unlock the possibility to use it to develop your **Power Creeps**.

You can view your GPL on the [Overview page](https://screeps.com/a/#!/overview) in the game, or using the [`Game.gpl`](https://docs.screeps.com/api/#Game.gpl) property in the API.

## Power Creeps

<video autoplay loop muted playsinline>
    <source src="https://raw.githubusercontent.com/screeps/docs/c7cb981eba13bd6c3c4a3ea274851326d74a506f/source/img/pc_anim.mp4" type="video/mp4">
</video>

[Power Creeps](https://docs.screeps.com/api/#PowerCreep) (PC) are game units different from regular creeps in the same way as hero units are different from regular ones in strategy games.

PCs are immortal. A newly-created PC is tied to your account and exists in it even if not spawned in the game world. After it dies (out of age or forcibly), it is just returned to your account and you can spawn it again in any of your Power Spawns after expiration of a 8-hours cooldown.

PCs can belong to either of the 3 classes:

|  |
| --- |
| **Operator**; A creep working mainly in the rear, at your base, though it can be used as a saboteur in offensive operations. |
| **Commander**; This power creep is not very useful on its own, but it’s a team player. It influences and affects regular creeps, both friendly and hostile. |
| **Executor**; This creep class prefers working alone. Due to its skills, it’s a very effective performer in your economy or as a war machine when defending or attacking. |

PCs have 0 to 25 development levels and skills (so-called “**powers**,” like superpowers). With each new level gained, you can add a new available skill or increase the level of any of the existing skills.

You need one free Global Power Level to increase a level of an existing PC. In the same way you can create a new 0-level PC by utilizing one free Global Power Level.

You can use PC skills in any room without a controller, or in a room with a power-enabled controller (see [`PowerCreep.enableRoom`](https://docs.screeps.com/api/#PowerCreep.enableRoom)).

Though PCs age and can die of old age, you can resume their time to live instantly and without cost by simply approaching any Power Spawn or Power Bank and executing [`PowerCreep.renew`](https://docs.screeps.com/api/#PowerCreep.renew). This allow them to move large distances on the map, provided you find Power Banks to recharge them on time.

<strong style="color: #f33">CAUTION</strong>: You can delete a Power Creep from your account (to free up the GPL used and create a new one with it), but this will **decrease your GPL by 1**! The removal of a PC from your account takes 24 hours.

If you want to review how your PCs are configured and create them from scratch, please activate an **experimentation period**. It will enable you to delete and recreate your PCs instantly without losing GPL within the 24-hour period. Each player is granted with 30 experimentation periods. It’s possible we’ll replenish them from time to time by some amount if balance adjustments or new skills are introduced in the game that force players to review their PC configuration.

## Powers

### Operator

|  |  |
| --- | --- |
| **GENERATE_OPS** | Generate 1/2/4/6/8 ops resource units. Cooldown 50 ticks. Required creep level: 0/2/7/14/22. |
| **OPERATE_SPAWN** | Reduce spawn time by 10/30/50/65/80%. Effect duration 1000 ticks. Cooldown 300 ticks. Range 3 squares. Consumes 100 ops resource units. Required creep level: 0/2/7/14/22. |
| **OPERATE_TOWER** | Increase damage, repair and heal amount by 10/20/30/40/50%. Effect duration 100 ticks. Cooldown 10 ticks. Range 3 squares. Consumes 10 ops resource units. Required creep level: 0/2/7/14/22. |
| **OPERATE_STORAGE** | Increase capacity by 500K/1M/2M/4M/7M units. Effect duration 1000 ticks. Cooldown 800 ticks. Range 3 squares. Consumes 100 ops resource units. Required creep level: 0/2/7/14/22. |
| **OPERATE_LAB** | Increase reaction amount by 2/4/6/8/10 units. Effect duration 1000 ticks. Cooldown 50 ticks. Range 3 squares. Consumes 10 ops resource units. Required creep level: 0/2/7/14/22. |
| **OPERATE_EXTENSION** | Instantly fill 20/40/60/80/100% of all extensions in the room using energy from the target structure (container, storage, or terminal). Cooldown 50 ticks. Range 3 squares. Consumes 2 ops resource units. Required creep level: 0/2/7/14/22. |
| **OPERATE_OBSERVER** | Grant unlimited range. Effect duration 200/400/600/800/1000 ticks. Cooldown 400 ticks. Range 3 squares. Consumes 10 ops resource units. Required creep level: 0/2/7/14/22. |
| **OPERATE_TERMINAL** | Decrease transfer energy cost and cooldown by 10/20/30/40/50%. Effect duration 1000 ticks. Cooldown 500 ticks. Range 3 squares. Consumes 100 ops resource units. Required creep level: 0/2/7/14/22. |
| **DISRUPT_SPAWN** | Pause spawning process. Effect duration 1/2/3/4/5 ticks. Cooldown 5 ticks. Range 20 squares. Consumes 10 ops resource units. Required creep level: 0/2/7/14/22. |
| **DISRUPT_TOWER** | Reduce effectiveness by 10/20/30/40/50%. Effect duration 5 ticks. No cooldown Range 50 squares. Consumes 10 ops resource units. Required creep level: 0/2/7/14/22. |
| **DISRUPT_SOURCE** | Pause energy regeneration. Effect duration 100/200/300/400/500 ticks. Cooldown 100 ticks. Range 3 squares. Consumes 100 ops resource units. Required creep level: 0/2/7/14/22. |
| **SHIELD** | Create a temporary non-repairable rampart structure on the same square with 5K/10K/15K/20K/25K hits. Cannot be used on top of another rampart. Consumes 100 energy resource units. Effect duration 50 ticks. Cooldown 20 ticks. Required creep level: 0/2/7/14/22. |
| **REGEN_SOURCE** | Regenerate 50/100/150/200/250 energy units in a source every 15 ticks. Effect duration 300 ticks. Cooldown 100 ticks. Range 3 squares. Required creep level: 10/11/12/14/22. |
| **REGEN_MINERAL** | Regenerate 2/4/6/8/10 mineral units in a deposit every 10 ticks. Effect duration 100 ticks. Cooldown 100 ticks. Range 3 squares. Required creep level: 10/11/12/14/22. |
| **DISRUPT_TERMINAL** | Block withdrawing or using resources from the terminal. Effect duration 10 ticks. Cooldown 8 ticks. Range 50 squares. Consumes 50/40/30/20/10 ops resource units. Required creep level: 20/21/22/23/24. |
| **OPERATE_POWER** | Increase power processing speed of a Power Spawn by 1/2/3/4/5 units per tick. Effect duration 1000 ticks. Cooldown 800 ticks. Range 3 squares. Consumes 200 ops resource units. Required creep level: 10/11/12/14/22. |
| **FORTIFY** | Make a wall or rampart tile invulnerable to all creep attacks and powers. Effect duration 1/2/3/4/5 ticks. Cooldown 5 ticks. Range 3 squares. Consumes 5 ops resource units. Required creep level: 0/2/7/14/22. |
| **OPERATE_CONTROLLER** | Increase max limit of energy that can be used for upgrading a Level 8 Controller each tick by 10/20/30/40/50 energy units. Effect duration 1000 ticks. Cooldown 800 ticks. Range 3 squares. Consumes 200 ops resource units. Required creep level: 20/21/22/23/24. |
| **OPERATE_FACTORY** | Set the level of the factory to the level of the power. This action is permanent, it cannot be undone, and another power level cannot be applied. Apply the same power again to renew its effect. Effect duration 1000 ticks. Cooldown 800 ticks. Range 3 squares. Consumes 100 ops resource units. Required creep level: 0/2/7/14/22. |

### Commander

Under development.

### Executor

Under development.
