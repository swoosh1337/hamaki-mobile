# Jetpack Runner Game Concept

## Overview
A horizontal endless runner game inspired by Jetpack Joyride, where players choose between two distinct characters and navigate through an urban street environment filled with obstacles and collectibles.

## Game Mechanics

### Core Gameplay
- **Movement**: Continuous horizontal running from right to left
- **Actions**: 
  - Jump (single tap)
  - Duck (swipe down)  
  - Double Jump (double tap)
  - Jetpack Flying (power-up activated)
- **Objective**: Survive as long as possible while collecting coins and avoiding obstacles

### Character Selection System

#### Shonzika (Heavy Character)
- **Build**: Fat and big guy
- **Speed**: Slower movement speed
- **Physics**: Heavier, different jump mechanics
- **Characteristics**: 
  - Higher health/more lives
  - Slower acceleration/deceleration
  - Different jump height and arc
  - Possibly damage resistance

#### Miro (Light Character)  
- **Build**: Shorter but agile
- **Speed**: Faster movement speed
- **Physics**: Lighter, more responsive
- **Characteristics**:
  - Standard health
  - Quick acceleration/deceleration  
  - Higher/more precise jumping
  - Better maneuverability

## Assets Specifications

### Character Assets

#### Character Selection Portraits
- **Resolution**: 200x280px each
- **Format**: Transparent PNG
- **Content**: Full body idle pose facing right
- **Style**: Clear personality distinction between characters

#### Character Animation Frames
- **Running Animation**: 6-8 frames, 140px tall
- **Jump Animation**: 3-4 frames showing leap motion
- **Duck Animation**: 2-3 frames, reduced height profile
- **Flying Animation**: 4-6 frames with jetpack effect
- **Idle Animation**: 2-4 frames for menus

### Environment Assets

#### Background Layers (Parallax Scrolling)
- **Far Background**: 1920x1080px
  - Distant buildings and skyline
  - Slowest movement speed
- **Mid Background**: 1920x1080px  
  - Closer buildings and details
  - Medium movement speed
- **Ground Layer**: 512x1080px (tileable)
  - Main street surface
  - Fastest movement speed

#### Street/Ground Details
- **Resolution**: 512x1080px (seamlessly tileable horizontally)
- **Content**:
  - Road surface (bottom ~200px)
  - Sidewalk and building facades
  - Street markings, manholes, urban details
- **Style**: Side-view perspective, minimal depth

### Game Objects

#### Obstacles
- **Banana Peel**: ~80px wide (jump over)
- **Low Barrier**: ~60px high (duck under) 
- **High Platform**: ~200px high (double jump onto)
- **Wall/Barrier**: ~150px high (normal jump over)

#### Collectibles & Power-ups
- **Coins**: ~40px diameter
  - Spinning animation (4-6 frames)
  - Golden color with shine effect
- **Jetpack**: ~100px size
  - Glowing/pulsing effect
  - Temporary flight ability

## Technical Implementation Plan

### Game Architecture
1. **Menu System**:
   - Main Menu
   - Character Selection Screen
   - Settings/Options
   - High Score Display

2. **Game Engine Components**:
   - Horizontal scrolling system
   - Physics engine (gravity, collision)
   - Character-specific movement controllers
   - Obstacle/collectible spawning system
   - Score and progression tracking

3. **Game States**:
   - `MENU` → Character selection
   - `CHARACTER_SELECT` → Choose Shonzika or Miro  
   - `PLAYING` → Active gameplay
   - `JETPACK_MODE` → Flying sequence
   - `GAME_OVER` → Results and restart

### Physics System

#### Movement Physics
- **Base Gravity**: Standard downward acceleration
- **Character-Specific Speeds**:
  - Shonzika: 0.8x base speed
  - Miro: 1.2x base speed
- **Jump Mechanics**:
  - Single jump: Character-specific height
  - Double jump: Available mid-air
  - Duck: Reduced hitbox, momentum maintained

#### Collision Detection
- **Precise Hitboxes**: Per-pixel or rectangle-based
- **Obstacle Types**: Ground, air, and ducking obstacles
- **Collectible Interaction**: Coin collection, power-up activation

### Scaling System

#### Resolution Independence
- **Base Design**: 1920x1080 landscape orientation
- **Character Reference**: 140px tall at base resolution
- **Scaling Formula**: `Scale Factor = Actual Screen Height / 1080`
- **Proportional Scaling**: All assets scale uniformly

#### Character Positioning
- **Ground Level**: 200px from bottom of screen
- **Running Position**: ~300px from left edge
- **Vertical Range**: Ground to ~800px height

## Progression & Scoring

### Score System
- **Distance**: Points per meter traveled
- **Coins**: Bonus points per coin collected
- **Multipliers**: Combo systems for consecutive actions
- **Character Bonuses**: Different scoring for each character

### Difficulty Progression
- **Obstacle Density**: Increases over time/distance
- **Speed Increase**: Gradual acceleration
- **New Obstacles**: Introduction of complex patterns
- **Power-up Frequency**: Balanced distribution

### Power-up System
- **Jetpack Duration**: 10-15 seconds of flight
- **Invincibility**: Brief damage immunity
- **Coin Magnet**: Auto-collect nearby coins
- **Speed Boost**: Temporary faster movement

## UI/UX Design

### Character Selection Screen
- **Layout**: Side-by-side character cards
- **Information Display**:
  - Character name and portrait
  - Speed, agility, and health stats
  - Previous high scores per character
- **Selection Feedback**: Visual highlighting and confirmation

### In-Game HUD
- **Top Left**: Score counter
- **Top Center**: Distance traveled  
- **Top Right**: Coin count
- **Bottom**: Power-up indicators and duration timers

### Game Over Screen
- **Results**: Final score, distance, coins collected
- **Leaderboards**: Best scores per character
- **Restart Options**: Same character or return to selection

## Future Enhancements

### Additional Features
- **Multiple Environments**: Different street themes
- **Character Customization**: Unlockable skins/outfits
- **Achievement System**: Challenges and rewards
- **Daily Challenges**: Special objectives
- **Multiplayer**: Race mode or leaderboards

### Power-up Expansions
- **Vehicle Mode**: Motorcycle or skateboard segments
- **Weapon Systems**: Clearing obstacles ahead
- **Environmental Interactions**: Wall running, swinging

## Development Priority

### Phase 1: Core Implementation
1. Character selection system
2. Basic horizontal scrolling
3. Jump/duck mechanics
4. Simple obstacle collision

### Phase 2: Game Polish  
1. Character-specific physics
2. Coin collection system
3. Jetpack power-up
4. Score and progression

### Phase 3: Enhancement
1. Multiple obstacle types
2. Parallax background system
3. Advanced animations
4. Sound effects and music

---

*This document serves as the complete specification for the Jetpack Runner game concept. All asset dimensions and technical requirements are optimized for React Native with Skia rendering.*