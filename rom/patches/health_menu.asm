; PokéHealth: in-game HEALTH menu
; Shows raw trainer health values + derived modifier tiers on one screen.
; All values right-aligned to column 17.

StartMenu_Health::
	call ClearScreen
	call UpdateSprites

	; Full-screen text box
	hlcoord 0, 0
	ld b, 16
	ld c, 18
	call TextBoxBorder

	; ── Title ──
	hlcoord 1, 1
	ld de, .sTitle
	call PlaceString

	; ── Raw values (right-aligned to col 13-17) ──

	; STEPS
	hlcoord 1, 3
	ld de, .sSteps
	call PlaceString
	hlcoord 13, 3
	ld de, wHealthStepsHi
	lb bc, 2, 5
	call PrintNumber

	; SLEEP — "XhY" format
	hlcoord 1, 4
	ld de, .sSleep
	call PlaceString
	ld a, [wHealthSleepX10]
	ld b, 0
.sleepDiv
	cp 10
	jr c, .sleepDone
	sub 10
	inc b
	jr .sleepDiv
.sleepDone
	ld c, a
	ld a, b
	ld [wHealthMenuScratch], a
	hlcoord 14, 4
	ld de, wHealthMenuScratch
	lb bc, 1, 2
	call PrintNumber
	hlcoord 16, 4
	ld a, CHARVAL("h")
	ld [hli], a
	ld a, [wHealthSleepX10]
	ld b, 0
.sleepDiv2
	cp 10
	jr c, .sleepDone2
	sub 10
	inc b
	jr .sleepDiv2
.sleepDone2
	add CHARVAL("0")
	ld [hl], a

	; CALORIES
	hlcoord 1, 5
	ld de, .sCal
	call PlaceString
	hlcoord 13, 5
	ld de, wHealthCaloriesHi
	lb bc, 2, 5
	call PrintNumber

	; WORKOUT + "M"
	hlcoord 1, 6
	ld de, .sWorkout
	call PlaceString
	hlcoord 14, 6
	ld de, wHealthWorkoutMin
	lb bc, 1, 3
	call PrintNumber
	hlcoord 17, 6
	ld a, CHARVAL("M")
	ld [hl], a

	; ── Separator ──
	hlcoord 1, 8
	ld de, .sSep
	call PlaceString

	; ── Modifier tiers (values at col 12) ──

	; B SPEED
	hlcoord 1, 9
	ld de, .sSpeed
	call PlaceString
	ld a, [wHealthBSpeedTier]
	and a
	jr nz, .spdNotOff
	ld de, .tOff
	jr .pSpd
.spdNotOff
	cp 1
	jr nz, .spdNot1
	ld de, .tLow
	jr .pSpd
.spdNot1
	cp 2
	jr nz, .spdNot2
	ld de, .tMed
	jr .pSpd
.spdNot2
	ld de, .tHigh
.pSpd
	hlcoord 12, 9
	call PlaceString

	; HEAL
	hlcoord 1, 10
	ld de, .sHeal
	call PlaceString
	ld a, [wHealthHealTier]
	and a
	jr nz, .healNot0
	ld de, .tH60
	jr .pHeal
.healNot0
	cp 1
	jr nz, .healNot1
	ld de, .tH85
	jr .pHeal
.healNot1
	ld de, .tHFull
.pHeal
	hlcoord 12, 10
	call PlaceString

	; XP RATE
	hlcoord 1, 11
	ld de, .sXP
	call PlaceString
	ld a, [wHealthXPMult]
	call .GetMultStr
	hlcoord 12, 11
	call PlaceString

	; MONEY
	hlcoord 1, 12
	ld de, .sMoney
	call PlaceString
	ld a, [wHealthMoneyMult]
	call .GetMultStr
	hlcoord 12, 12
	call PlaceString

	; CATCH
	hlcoord 1, 13
	ld de, .sCatch
	call PlaceString
	ld a, [wHealthCatchMult]
	call .GetMultStr
	hlcoord 12, 13
	call PlaceString

	; ── Close hint ──
	hlcoord 1, 15
	ld de, .sClose
	call PlaceString

	; Wait
.waitLoop
	call Joypad
	ldh a, [hJoyPressed]
	and PAD_B | PAD_A | PAD_START
	jr z, .waitLoop

	call LoadScreenTilesFromBuffer2
	jp RedisplayStartMenu

; ── Multiplier lookup ──
.GetMultStr
	cp 75
	jr z, .m75
	cp 90
	jr z, .m90
	cp 120
	jr z, .m120
	cp 125
	jr z, .m125
	cp 135
	jr z, .m135
	cp 150
	jr z, .m150
	ld de, .tM100
	ret
.m75
	ld de, .tM75
	ret
.m90
	ld de, .tM90
	ret
.m120
	ld de, .tM120
	ret
.m125
	ld de, .tM125
	ret
.m135
	ld de, .tM135
	ret
.m150
	ld de, .tM150
	ret

; ── Strings ──
.sTitle   db "TRAINER HEALTH@"
.sSep     db "------------------@"
.sSteps   db "STEPS@"
.sSleep   db "SLEEP@"
.sCal     db "CALORIES@"
.sWorkout db "WORKOUT@"
.sSpeed   db "B SPEED@"
.sHeal    db "HEAL@"
.sXP      db "XP RATE@"
.sMoney   db "MONEY@"
.sCatch   db "CATCH@"
.sClose   db "B TO CLOSE@"

.tOff     db "OFF@"
.tLow     db "LOW@"
.tMed     db "MED@"
.tHigh    db "HIGH@"
.tH60     db "60 PCT@"
.tH85     db "85 PCT@"
.tHFull   db "FULL@"
.tM75     db "x0.75@"
.tM90     db "x0.90@"
.tM100    db "x1.00@"
.tM120    db "x1.20@"
.tM125    db "x1.25@"
.tM135    db "x1.35@"
.tM150    db "x1.50@"

; ── ShowHealthMsg: display a message based on wHealthMsgId, then clear it ──
; Called via farcall from hook sites in other banks.
; Message IDs:
;   1 = Heal: tired (60%)        2 = Heal: not bad (85%)
;   3 = Heal: well rested (full) 4 = XP: low energy
;   5 = XP: burning calories     6 = Money: lazy day
;   7 = Money: great workout     8 = Catch: shaky hands
;   9 = Catch: steady hands

ShowHealthMsg::
	ld a, [wHealthMsgId]
	and a
	ret z
	; look up message pointer
	dec a
	add a ; a *= 2 (pointer table index)
	ld c, a
	ld b, 0
	ld hl, .msgTable
	add hl, bc
	ld a, [hli]
	ld h, [hl]
	ld l, a
	call PrintText
	xor a
	ld [wHealthMsgId], a
	ret

.msgTable:
	dw .msgHealTired      ;  1 — Heal: 60% (bad sleep)
	dw .msgHealOkay       ;  2 — Heal: 85% (okay sleep)
	dw .msgHealRested     ;  3 — Heal: full + revive (great sleep)
	dw .msgXPLow          ;  4 — XP: penalty
	dw .msgXPNormal       ;  5 — XP: standard
	dw .msgXPBoosted      ;  6 — XP: bonus
	dw .msgMoneyLazy      ;  7 — Money: penalty
	dw .msgMoneyNormal    ;  8 — Money: standard
	dw .msgMoneyWorkout   ;  9 — Money: bonus
	dw .msgCatchShaky     ; 10 — Catch: penalty
	dw .msgCatchNormal    ; 11 — Catch: standard
	dw .msgCatchSteady    ; 12 — Catch: bonus

; ── Heal — based on sleep (1-3) ──
.msgHealTired:
	text "Poor sleep last"
	line "night… Partial"
	cont "heal only!"
	prompt

.msgHealOkay:
	text "Slept okay last"
	line "night. Healed"
	cont "to 85 PCT!"
	prompt

.msgHealRested:
	text "Great sleep last"
	line "night! Full heal"
	cont "and REVIVE!"
	prompt

; ── XP — based on calories (4-6) ──
.msgXPLow:
	text "Few calories"
	line "burned yesterday."
	cont "Less XP gained!"
	prompt

.msgXPNormal:
	text "Calories on track"
	line "yesterday."
	cont "Standard XP."
	prompt

.msgXPBoosted:
	text "Lots of calories"
	line "burned yesterday!"
	cont "XP boosted!"
	prompt

; ── Money — based on workout (7-9) ──
.msgMoneyLazy:
	text "No workout"
	line "yesterday… Less"
	cont "prize money!"
	prompt

.msgMoneyNormal:
	text "Some exercise"
	line "yesterday."
	cont "Standard winnings."
	prompt

.msgMoneyWorkout:
	text "Great workout"
	line "yesterday! Extra"
	cont "prize money!"
	prompt

; ── Catch — based on workout (10-12) ──
.msgCatchShaky:
	text "No workout"
	line "yesterday…"
	cont "Harder to catch!"
	prompt

.msgCatchNormal:
	text "Some exercise"
	line "yesterday. Normal"
	cont "catch rate."
	prompt

.msgCatchSteady:
	text "Big workout"
	line "yesterday! Catch"
	cont "rate boosted!"
	prompt
