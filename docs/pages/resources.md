# Resources

There are 4 kinds of resources in the game: **energy**, **minerals**, **power**, and **commodities**.
Resources can be harvested, processed, traded on the market, carried by creeps, and stored in structures.
All resource kinds have different purposes, and you start playing only with access to the most basic one: energy.

## Energy

**Where to get:** a [`Source`](https://docs.screeps.com/api/#Source) in almost any room. <br>
**How to get:** send a creep with a `WORK` part and [`harvest`](https://docs.screeps.com/api/#Creep.harvest) it. <br>
**Needed for:** spawning creeps, building structures.

Energy is the main construction material in the Screeps world. Your base works on energy, so harvesting plenty of it is vital for any colony.
You can harvest energy not only in your home room, but also in other rooms remotely to increase energy income.

## Minerals

**Where to get:** a [`Mineral`](https://docs.screeps.com/api/#Mineral) in almost any room. <br>
**How to get:** build a [`StructureExtractor`](https://docs.screeps.com/api/#StructureExtractor), send a creep with a `WORK` part, and [`harvest`](https://docs.screeps.com/api/#Creep.harvest) it. <br>
**Needed for:** boosting creeps' capabilities, and also for producing trade commodities.

By mining and processing minerals, you can significantly speed up your economy and boost the effectiveness of your creeps.

Working with minerals consists of 3 steps:

### Harvesting

There are 7 types of base minerals shown in the picture below.

![](https://docs.screeps.com/img/minerals-01.png)

Each room contains only one mineral type, so in order to handle them effectively you need either access to several suitable rooms or trade relationships with other players.

<img src="https://docs.screeps.com/img/mining_minerals.png" align="right">A mineral deposit is located in a room at a spot marked by a special symbol. To start mining the deposit, you need to construct the special structure [**Extractor**](https://docs.screeps.com/api/#StructureExtractor) on top of it (available at Room Controller Level 6). Upon building it, you can start applying the method [`harvest`](https://docs.screeps.com/api/#Creep.harvest) to the deposit thus mining the corresponding mineral in the same way you harvest energy.

### Mineral compounds

Base minerals are useless on their own. In order to impart some useful capabilities to them, you have to combine them according to special formulas in the structure called [**Lab**](https://docs.screeps.com/api/#StructureLab).

![](https://docs.screeps.com/img/minerals-02.png)

One reaction requires three labs: two as reagent sources, and the third one as the produce collector. The labs should be within the range of 2 squares from each other. One lab cannot contain more than one mineral type at the same time.

<img src="https://docs.screeps.com/img/2016-03-09_10-32-33.gif" align="right">

    var labs = room.find(FIND_MY_STRUCTURES,
        {filter: {structureType: STRUCTURE_LAB}});

    labs[0].runReaction(labs[1], labs[2]);

    // on the next tick...

    console.log(labs[0].mineralType) // -> OH
    console.log(labs[1].mineralType) // -> O
    console.log(labs[2].mineralType) // -> H

### Creep boosts

Apart from running chemical reactions with minerals, a lab can use resulting compounds to permanently upgrade your creeps boosting their specific properties.

Each compound is applied to one body part of the creep of a certain type using the [`StructureLab.boostCreep`](https://docs.screeps.com/api/#StructureLab.boostCreep) method according to the table below and boosts the effectiveness of one of the actions of this creep. The boosted part works as two, three, or even four corresponding parts. To boost the whole creep, you need to boost all its parts of the given type.

Boosting one body part takes 30 mineral compound units and 20 energy units. One body part can be boosted only with one compound type.

#### Mineral compounds

| Name | Formula | Time | Body part | Effect |
| --- | --- | --- | --- | --- |
| **Base compounds** |  |  |  |  |
| ![](https://static.screeps.com/upload/mineral-icons/OH.png) hydroxide | ![](https://static.screeps.com/upload/mineral-icons/H.png) + ![](https://static.screeps.com/upload/mineral-icons/O.png) | 20 | — | — |
| ![](https://static.screeps.com/upload/mineral-icons/ZK.png) zynthium keanite | ![](https://static.screeps.com/upload/mineral-icons/Z.png) + ![](https://static.screeps.com/upload/mineral-icons/K.png) | 5 | — | — |
| ![](https://static.screeps.com/upload/mineral-icons/UL.png) utrium lemergite | ![](https://static.screeps.com/upload/mineral-icons/U.png) + ![](https://static.screeps.com/upload/mineral-icons/L.png) | 5 | — | — |
| ![](https://static.screeps.com/upload/mineral-icons/G.png) ghodium | ![](https://static.screeps.com/upload/mineral-icons/ZK.png) + ![](https://static.screeps.com/upload/mineral-icons/UL.png) | 5 | — | — |
| **Tier 1 compounds** |  |  |  |  |
| ![](https://static.screeps.com/upload/mineral-icons/UH.png) utrium hydride | ![](https://static.screeps.com/upload/mineral-icons/U.png) + ![](https://static.screeps.com/upload/mineral-icons/H.png) | 10 | `ATTACK` | +100% `attack` effectiveness |
| ![](https://static.screeps.com/upload/mineral-icons/UO.png) utrium oxide | ![](https://static.screeps.com/upload/mineral-icons/U.png) + ![](https://static.screeps.com/upload/mineral-icons/O.png) | 10 | `WORK` | +200% `harvest` effectiveness |
| ![](https://static.screeps.com/upload/mineral-icons/KH.png) keanium hydride | ![](https://static.screeps.com/upload/mineral-icons/K.png) + ![](https://static.screeps.com/upload/mineral-icons/H.png) | 10 | `CARRY` | +50 capacity |
| ![](https://static.screeps.com/upload/mineral-icons/KO.png) keanium oxide | ![](https://static.screeps.com/upload/mineral-icons/K.png) + ![](https://static.screeps.com/upload/mineral-icons/O.png) | 10 | `RANGED_ATTACK` | +100% `rangedAttack` and `rangedMassAttack` effectiveness |
| ![](https://static.screeps.com/upload/mineral-icons/LH.png) lemergium hydride | ![](https://static.screeps.com/upload/mineral-icons/L.png) + ![](https://static.screeps.com/upload/mineral-icons/H.png) | 15 | `WORK` | +50% `repair` and `build` effectiveness without increasing the energy cost |
| ![](https://static.screeps.com/upload/mineral-icons/LO.png) lemergium oxide | ![](https://static.screeps.com/upload/mineral-icons/L.png) + ![](https://static.screeps.com/upload/mineral-icons/O.png) | 10 | `HEAL` | +100% `heal` and `rangedHeal` effectiveness |
| ![](https://static.screeps.com/upload/mineral-icons/ZH.png) zynthium hydride | ![](https://static.screeps.com/upload/mineral-icons/Z.png) + ![](https://static.screeps.com/upload/mineral-icons/H.png) | 20 | `WORK` | +100% `dismantle` effectiveness |
| ![](https://static.screeps.com/upload/mineral-icons/ZO.png) zynthium oxide | ![](https://static.screeps.com/upload/mineral-icons/Z.png) + ![](https://static.screeps.com/upload/mineral-icons/O.png) | 10 | `MOVE` | +100% fatigue decrease speed |
| ![](https://static.screeps.com/upload/mineral-icons/GH.png) ghodium hydride | ![](https://static.screeps.com/upload/mineral-icons/G.png) + ![](https://static.screeps.com/upload/mineral-icons/H.png) | 10 | `WORK` | +50% `upgradeController` effectiveness without increasing the energy cost |
| ![](https://static.screeps.com/upload/mineral-icons/GO.png) ghodium oxide | ![](https://static.screeps.com/upload/mineral-icons/G.png) + ![](https://static.screeps.com/upload/mineral-icons/O.png) | 10 | `TOUGH` | -30% damage taken |
| **Tier 2 compounds** |  |  |  |  |
| ![](https://static.screeps.com/upload/mineral-icons/UH2O.png) utrium acid | ![](https://static.screeps.com/upload/mineral-icons/UH.png) + ![](https://static.screeps.com/upload/mineral-icons/OH.png) | 5 | `ATTACK` | +200% `attack` effectiveness |
| ![](https://static.screeps.com/upload/mineral-icons/UHO2.png) utrium alkalide | ![](https://static.screeps.com/upload/mineral-icons/UO.png) + ![](https://static.screeps.com/upload/mineral-icons/OH.png) | 5 | `WORK` | +400% `harvest` effectiveness |
| ![](https://static.screeps.com/upload/mineral-icons/KH2O.png) keanium acid | ![](https://static.screeps.com/upload/mineral-icons/KH.png) + ![](https://static.screeps.com/upload/mineral-icons/OH.png) | 5 | `CARRY` | +100 capacity |
| ![](https://static.screeps.com/upload/mineral-icons/KHO2.png) keanium alkalide | ![](https://static.screeps.com/upload/mineral-icons/KO.png) + ![](https://static.screeps.com/upload/mineral-icons/OH.png) | 5 | `RANGED_ATTACK` | +200% `rangedAttack` and `rangedMassAttack` effectiveness |
| ![](https://static.screeps.com/upload/mineral-icons/LH2O.png) lemergium acid | ![](https://static.screeps.com/upload/mineral-icons/LH.png) + ![](https://static.screeps.com/upload/mineral-icons/OH.png) | 10 | `WORK` | +80% `repair` and `build` effectiveness without increasing the energy cost |
| ![](https://static.screeps.com/upload/mineral-icons/LHO2.png) lemergium alkalide | ![](https://static.screeps.com/upload/mineral-icons/LO.png) + ![](https://static.screeps.com/upload/mineral-icons/OH.png) | 5 | `HEAL` | +200% `heal` and `rangedHeal` effectiveness |
| ![](https://static.screeps.com/upload/mineral-icons/ZH2O.png) zynthium acid | ![](https://static.screeps.com/upload/mineral-icons/ZH.png) + ![](https://static.screeps.com/upload/mineral-icons/OH.png) | 40 | `WORK` | +200% `dismantle` effectiveness |
| ![](https://static.screeps.com/upload/mineral-icons/ZHO2.png) zynthium alkalide | ![](https://static.screeps.com/upload/mineral-icons/ZO.png) + ![](https://static.screeps.com/upload/mineral-icons/OH.png) | 5 | `MOVE` | +200% fatigue decrease speed |
| ![](https://static.screeps.com/upload/mineral-icons/GH2O.png) ghodium acid | ![](https://static.screeps.com/upload/mineral-icons/GH.png) + ![](https://static.screeps.com/upload/mineral-icons/OH.png) | 15 | `WORK` | +80% `upgradeController` effectiveness without increasing the energy cost |
| ![](https://static.screeps.com/upload/mineral-icons/GHO2.png) ghodium alkalide | ![](https://static.screeps.com/upload/mineral-icons/GO.png) + ![](https://static.screeps.com/upload/mineral-icons/OH.png) | 30 | `TOUGH` | -50% damage taken |
| **Tier 3 compounds** |  |  |  |  |
| ![](https://static.screeps.com/upload/mineral-icons/XUH2O.png) catalyzed utrium acid | ![](https://static.screeps.com/upload/mineral-icons/UH2O.png) + ![](https://static.screeps.com/upload/mineral-icons/X.png) | 60 | `ATTACK` | +300% `attack` effectiveness |
| ![](https://static.screeps.com/upload/mineral-icons/XUHO2.png) catalyzed utrium alkalide | ![](https://static.screeps.com/upload/mineral-icons/UHO2.png) + ![](https://static.screeps.com/upload/mineral-icons/X.png) | 60 | `WORK` | +600% `harvest` effectiveness |
| ![](https://static.screeps.com/upload/mineral-icons/XKH2O.png) catalyzed keanium acid | ![](https://static.screeps.com/upload/mineral-icons/KH2O.png) + ![](https://static.screeps.com/upload/mineral-icons/X.png) | 60 | `CARRY` | +150 capacity |
| ![](https://static.screeps.com/upload/mineral-icons/XKHO2.png) catalyzed keanium alkalide | ![](https://static.screeps.com/upload/mineral-icons/KHO2.png) + ![](https://static.screeps.com/upload/mineral-icons/X.png) | 60 | `RANGED_ATTACK` | +300% `rangedAttack` and `rangedMassAttack` effectiveness |
| ![](https://static.screeps.com/upload/mineral-icons/XLH2O.png) catalyzed lemergium acid | ![](https://static.screeps.com/upload/mineral-icons/LH2O.png) + ![](https://static.screeps.com/upload/mineral-icons/X.png) | 65 | `WORK` | +100% `repair` and `build` effectiveness without increasing the energy cost |
| ![](https://static.screeps.com/upload/mineral-icons/XLHO2.png) catalyzed lemergium alkalide | ![](https://static.screeps.com/upload/mineral-icons/LHO2.png) + ![](https://static.screeps.com/upload/mineral-icons/X.png) | 60 | `HEAL` | +300% `heal` and `rangedHeal` effectiveness |
| ![](https://static.screeps.com/upload/mineral-icons/XZH2O.png) catalyzed zynthium acid | ![](https://static.screeps.com/upload/mineral-icons/ZH2O.png) + ![](https://static.screeps.com/upload/mineral-icons/X.png) | 160 | `WORK` | +300% `dismantle` effectiveness |
| ![](https://static.screeps.com/upload/mineral-icons/XZHO2.png) catalyzed zynthium alkalide | ![](https://static.screeps.com/upload/mineral-icons/ZHO2.png) + ![](https://static.screeps.com/upload/mineral-icons/X.png) | 60 | `MOVE` | +300% fatigue decrease speed |
| ![](https://static.screeps.com/upload/mineral-icons/XGH2O.png) catalyzed ghodium acid | ![](https://static.screeps.com/upload/mineral-icons/GH2O.png) + ![](https://static.screeps.com/upload/mineral-icons/X.png) | 80 | `WORK` | +100% `upgradeController` effectiveness without increasing the energy cost |
| ![](https://static.screeps.com/upload/mineral-icons/XGHO2.png) catalyzed ghodium alkalide | ![](https://static.screeps.com/upload/mineral-icons/GHO2.png) + ![](https://static.screeps.com/upload/mineral-icons/X.png) | 150 | `TOUGH` | -70% damage taken |

## Commodities

**Where to get:** a [`Deposit`](https://docs.screeps.com/api/#Deposit) in "highway" rooms. <br>
**How to get:** send a creep with a `WORK` part and [`harvest`](https://docs.screeps.com/api/#Creep.harvest) it. <br>
**Needed for:** producing trade commodities and earning credits.

Trade commodities are resources that NPC market traders are most interested in. These resources have no other purpose
other than to be sold and generate credits. Producing high-level commodities is the most profitable business in the game.

### Harvesting

You harvest raw commodities from a [`Deposit`](https://docs.screeps.com/api/#Deposit) in "highway" rooms that divide living sectors on the map.
There are 4 types of raw resources: Metal, Silicon, Biomass, Mist.
They are distributed unevenly across the world map: one resource type per map quadrant (NW, NE, SW, SE).

![](https://docs.screeps.com/img/commodities.png)

Unlike minerals, these deposits exhaust as you harvest them: the more you harvest, the longer cooldown becomes.
They vanish when you stop harvesting it after some time, and reappear elsewhere nearby.
Also, a new deposit will appear in the sector if all other deposits are exhausted below some level.

### Basic commodities

Selling raw resources may be not very profitable.
This is why it's a better idea to build a [**Factory**](https://docs.screeps.com/api/#StructureFactory) (available at RCL 7) in order to [`produce`](https://docs.screeps.com/api/#StructureFactory.produce) more complex commodities.

A newly built factory has no level which means it can produce just a few basic commodities out of all kinds of existing resources ("any level" tier in the tables below).
They also can be used to store resources in a "compressed" form.

#### Compressing commodities

![](https://docs.screeps.com/img/commodities1.png)

| Product | Factory | Components | Cooldown |
| --- | --- | --- | --- |
| Utrium bar × *100* | Any level | ![](https://static.screeps.com/upload/mineral-icons/U.png) Utrium × *500*; Energy × *200* | 20 ticks |
| Lemergium bar × *100* | Any level | ![](https://static.screeps.com/upload/mineral-icons/L.png) Lemergium × *500*; Energy × *200* | 20 ticks |
| Zynthium bar × *100* | Any level | ![](https://static.screeps.com/upload/mineral-icons/Z.png) Zynthium × *500*; Energy × *200* | 20 ticks |
| Keanium bar × *100* | Any level | ![](https://static.screeps.com/upload/mineral-icons/K.png) Keanium × *500*; Energy × *200* | 20 ticks |
| Ghodium melt × *100* | Any level | ![](https://static.screeps.com/upload/mineral-icons/G.png) Ghodium × *500*; Energy × *200* | 20 ticks |
| Oxidant × *100* | Any level | ![](https://static.screeps.com/upload/mineral-icons/O.png) Oxygen × *500*; Energy × *200* | 20 ticks |
| Reductant × *100* | Any level | ![](https://static.screeps.com/upload/mineral-icons/H.png) Hydrogen × *500*; Energy × *200* | 20 ticks |
| Purifier × *100* | Any level | ![](https://static.screeps.com/upload/mineral-icons/X.png) Catalyst × *500*; Energy × *200* | 20 ticks |
| Battery × *50* | Any level | Energy × *600* | 10 ticks |

 You can decompress to recover raw resources when you need them.

#### Decompressing commodities

![](https://docs.screeps.com/img/commodities2.png)

| Product | Factory | Components | Cooldown |
| --- | --- | --- | --- |
| ![](https://static.screeps.com/upload/mineral-icons/U.png) Utrium × *500* | Any level | Utrium bar × *100*; Energy × *200* | 20 ticks |
| ![](https://static.screeps.com/upload/mineral-icons/L.png) Lemergium × *500* | Any level | Lemergium bar × *100*; Energy × *200* | 20 ticks |
| ![](https://static.screeps.com/upload/mineral-icons/Z.png) Zynthium × *500* | Any level | Zynthium bar × *100*; Energy × *200* | 20 ticks |
| ![](https://static.screeps.com/upload/mineral-icons/K.png) Keanium × *500* | Any level | Keanium bar × *100*; Energy × *200* | 20 ticks |
| ![](https://static.screeps.com/upload/mineral-icons/G.png) Ghodium × *500* | Any level | Ghodium melt × *100*; Energy × *200* | 20 ticks |
| ![](https://static.screeps.com/upload/mineral-icons/O.png) Oxygen × *500* | Any level | Oxidant × *100*; Energy × *200* | 20 ticks |
| ![](https://static.screeps.com/upload/mineral-icons/H.png) Hydrogen × *500* | Any level | Reductant × *100*; Energy × *200* | 20 ticks |
| ![](https://static.screeps.com/upload/mineral-icons/X.png) Catalyst × *500* | Any level | Purifier × *100*; Energy × *200* | 20 ticks |
| Energy × *500* | Any level | Battery × *50* | 10 ticks |

 When you gain access to regional deposit resources, you can start producing additional basic commodities from them.

#### Basic regional commodities

![](https://docs.screeps.com/img/commodities3.png)

| Product | Factory | Components | Cooldown |
| --- | --- | --- | --- |
| Wire × *20* | Any level | Utrium bar × *20*; Silicon × *100*; Energy × *40* | 8 ticks |
| Cell × *20* | Any level | Lemergium bar × *20*; Biomass × *100*; Energy × *40* | 8 ticks |
| Alloy × *20* | Any level | Zynthium bar × *20*; Metal × *100*; Energy × *40* | 8 ticks |
| Condensate × *20* | Any level | Keanium bar × *20*; Mist × *100*; Energy × *40* | 8 ticks |

All commodities above can be produced in a factory of any level.

### Higher commodities

The full use of factories is possible with [Operators](https://docs.screeps.com/power.html#Power-Creeps) only, and their `OPERATE_FACTORY` power.
When an Operator uses this power on a factory without a level, the level of the factory is permanently set to the level of the power, and the same effect is applied on the factory.
It enables the factory to produce commodities of the corresponding level.
The factory can only produce commodities of exactly the same level, or "any level" commodities.
Once set, the factory level cannot be changed.
When the effect duration ends, the factory simply becomes inactive, but its level remains the same ("any level" commodities are still available though).
You need an Operator with the same power level to reactivate it again.
Another level cannot be applied, the only way to change the factory level is to rebuild it.

Each of high-level commodities requires lower level commodities to be produced which forms production chains. There are four production chains, one for each of new resource types:
**Mechanical** (consumes Metal), **Electronical** (consumes Silicon), **Biological** (consumes Biomass), and **Mystical** (consumes Mist), as well as common components.
These commodities have the most lucrative prices on the market.

#### Common higher commodities

![](https://docs.screeps.com/img/commodities4.png)

| Product | Factory | Components | Cooldown |
| --- | --- | --- | --- |
| Composite × *20* | Lvl 1 | Utrium bar × *20*; Zynthium bar × *20*; Energy × *20* | 50 ticks |
| Crystal × *6* | Lvl 2 | Lemergium bar × *6*; Keanium bar × *6*; Purifier × *6*; Energy × *45* | 21 ticks |
| Liquid × *12* | Lvl 3 | Oxidant × *12*; Reductant × *12*; Ghodium melt × *12*; Energy × *90* | 60 ticks |

#### Mechanical chain

![](https://docs.screeps.com/img/commodities5.png)

| Product | Factory | Components | Cooldown |
| --- | --- | --- | --- |
| Tube × *2* | Lvl 1 | Alloy × *40*; Zynthium bar × *16*; Energy × *8* | 45 ticks |
| Fixtures | Lvl 2 | Composite × *20*; Alloy × *41*; Oxidant × *161*; Energy × *8* | 115 ticks |
| Frame | Lvl 3 | Fixtures × *2*; Tube × *4*; Reductant × *330*; Zynthium bar × *31*; Energy × *16* | 125 ticks |
| Hydraulics | Lvl 4 | Liquid × *150*; Fixtures × *3*; Tube × *15*; Purifier × *208*; Energy × *32* | 800 ticks |
| Machine | Lvl 5 | Hydraulics × *1*; Frame × *2*; Fixtures × *3*; Tube × *12*; Energy × *64* | 600 ticks |

#### Biological chain

![](https://docs.screeps.com/img/commodities6.png)

| Product | Factory | Components | Cooldown |
| --- | --- | --- | --- |
| Phlegm × *2* | Lvl 1 | Cell × *20*; Oxidant × *36*; Lemergium bar × *16*; Energy × *8* | 35 ticks |
| Tissue × *2* | Lvl 2 | Phlegm × *10*; Cell × *10*; Reductant × *110*; Energy × *16* | 164 ticks |
| Muscle | Lvl 3 | Tissue × *3*; Phlegm × *3*; Zynthium bar × *50*; Reductant × *50*; Energy × *16* | 250 ticks |
| Organoid | Lvl 4 | Muscle × *1*; Tissue × *5*; Purifier × *208*; Oxidant × *256*; Energy × *32* | 800 ticks |
| Organism | Lvl 5 | Organoid × *1*; Liquid × *150*; Tissue × *6*; Cell × *310*; Energy × *64* | 600 ticks |

#### Electronical chain

![](https://docs.screeps.com/img/commodities7.png)

| Product | Factory | Components | Cooldown |
| --- | --- | --- | --- |
| Switch × *5* | Lvl 1 | Wire × *40*; Oxidant × *95*; Utrium bar × *35*; Energy × *20* | 70 ticks |
| Transistor | Lvl 2 | Switch × *4*; Wire × *15*; Reductant × *85*; Energy × *8* | 59 ticks |
| Microchip | Lvl 3 | Transistor × *2*; Composite × *50*; Wire × *117*; Purifier × *25*; Energy × *16* | 250 ticks |
| Circuit | Lvl 4 | Microchip × *1*; Transistor × *5*; Switch × *4*; Oxidant × *115*; Energy × *32* | 800 ticks |
| Device | Lvl 5 | Circuit × *1*; Microchip × *3*; Crystal × *110*; Ghodium melt × *150*; Energy × *64* | 600 ticks |

#### Mystical chain

![](https://docs.screeps.com/img/commodities8.png)

| Product | Factory | Components | Cooldown |
| --- | --- | --- | --- |
| Concentrate × *3* | Lvl 1 | Condensate × *30*; Keanium bar × *15*; Reductant × *54*; Energy × *12* | 41 ticks |
| Extract × *2* | Lvl 2 | Concentrate × *10*; Condensate × *30*; Oxidant × *60*; Energy × *16* | 128 ticks |
| Spirit | Lvl 3 | Extract × *2*; Concentrate × *6*; Reductant × *90*; Purifier × *20*; Energy × *16* | 200 ticks |
| Emanation | Lvl 4 | Spirit × *2*; Extract × *2*; Concentrate × *3*; Keanium bar × *112*; Energy × *32* | 800 ticks |
| Essence | Lvl 5 | Emanation × *1*; Spirit × *3*; Crystal × *110*; Ghodium melt × *150*; Energy × *64* | 600 ticks |

## Power

**Where to get:** a [`StructurePowerBank`](https://docs.screeps.com/api/#StructurePowerBank) in "highway" rooms. <br>
**How to get:** destroy the structure and loot the dropped resource. <br>
**Needed for:** creating Power Creeps.

See this article for more info: [Power](https://docs.screeps.com/power.html).
