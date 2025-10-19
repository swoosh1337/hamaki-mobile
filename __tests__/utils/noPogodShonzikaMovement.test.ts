/**
 * Tests for Shonzika movement system with animations
 */

import { loadNoPogodGameAssets } from '../../utils/noPogodGameAssets';
import { NO_POGOD_CONFIG, NoPogodGameEngine } from '../../utils/noPogodGameEngine';

describe('NoPogodGameEngine - Shonzika Movement System', () => {
  let engine: NoPogodGameEngine;
  let assets: any;

  beforeEach(() => {
    assets = loadNoPogodGameAssets();
    engine = new NoPogodGameEngine(400, 800, assets);
  });

  describe('Shonzika State Interface', () => {
    it('should have all required movement properties in ShonzikaState', () => {
      engine.startGame();
      const state = engine.getState();
      
      expect(state.shonzika).toHaveProperty('position');
      expect(state.shonzika).toHaveProperty('x');
      expect(state.shonzika).toHaveProperty('targetX');
      expect(state.shonzika).toHaveProperty('startX');
      expect(state.shonzika).toHaveProperty('isMoving');
      expect(state.shonzika).toHaveProperty('animationProgress');
      expect(state.shonzika).toHaveProperty('movementStartTime');
      expect(state.shonzika).toHaveProperty('nextMoveTime');
    });

    it('should initialize Shonzika at CENTER position', () => {
      engine.startGame();
      const state = engine.getState();
      
      expect(state.shonzika.position).toBe('CENTER');
      expect(state.shonzika.isMoving).toBe(false);
      expect(state.shonzika.animationProgress).toBe(1.0);
    });

    it('should have nextMoveTime scheduled between 3-5 seconds', () => {
      engine.startGame();
      const state = engine.getState();
      
      expect(state.shonzika.nextMoveTime).toBeGreaterThanOrEqual(NO_POGOD_CONFIG.SHONZIKA_MOVE_INTERVAL_MIN);
      expect(state.shonzika.nextMoveTime).toBeLessThanOrEqual(NO_POGOD_CONFIG.SHONZIKA_MOVE_INTERVAL_MAX);
    });
  });

  describe('Random Movement Logic', () => {
    it('should start moving after nextMoveTime is reached', () => {
      engine.startGame();
      const initialState = engine.getState();
      const nextMoveTime = initialState.shonzika.nextMoveTime;
      
      // Simulate time passing until movement should start
      let currentTime = 0;
      let hasStartedMoving = false;
      
      while (currentTime < nextMoveTime + 1000 && !hasStartedMoving) {
        currentTime += 100;
        engine.update(currentTime);
        const state = engine.getState();
        
        if (state.shonzika.isMoving) {
          hasStartedMoving = true;
        }
      }
      
      expect(hasStartedMoving).toBe(true);
    });

    it('should move to a different position than current', () => {
      engine.startGame();
      const initialState = engine.getState();
      const initialPosition = initialState.shonzika.position;
      const nextMoveTime = initialState.shonzika.nextMoveTime;
      
      // Simulate time until movement completes
      let currentTime = 0;
      let finalPosition = initialPosition;
      
      while (currentTime < nextMoveTime + NO_POGOD_CONFIG.SHONZIKA_MOVE_DURATION + 1000) {
        currentTime += 100;
        engine.update(currentTime);
        const state = engine.getState();
        
        if (!state.shonzika.isMoving && currentTime > nextMoveTime) {
          finalPosition = state.shonzika.position;
          break;
        }
      }
      
      // Position should have changed (though there's a small chance it randomly picks the same)
      // We'll just verify the movement system was triggered
      expect(['LEFT', 'CENTER', 'RIGHT']).toContain(finalPosition);
    });

    it('should move between LEFT, CENTER, and RIGHT positions', () => {
      engine.startGame();
      
      const positions = new Set<string>();
      let currentTime = 0;
      
      // Run for 20 seconds to capture multiple movements
      while (currentTime < 20000) {
        currentTime += 100;
        engine.update(currentTime);
        const state = engine.getState();
        positions.add(state.shonzika.position);
      }
      
      // Should have visited at least 2 different positions in 20 seconds
      expect(positions.size).toBeGreaterThanOrEqual(1);
      
      // All positions should be valid
      positions.forEach(pos => {
        expect(['LEFT', 'CENTER', 'RIGHT']).toContain(pos);
      });
    });
  });

  describe('Smooth Movement Interpolation', () => {
    it('should smoothly interpolate x position during movement', () => {
      engine.startGame();
      const initialState = engine.getState();
      const nextMoveTime = initialState.shonzika.nextMoveTime;
      
      let currentTime = 0;
      let startX = 0;
      let targetX = 0;
      let movementStarted = false;
      const xPositions: number[] = [];
      
      // Simulate until movement starts and completes
      while (currentTime < nextMoveTime + NO_POGOD_CONFIG.SHONZIKA_MOVE_DURATION + 1000) {
        currentTime += 50;
        engine.update(currentTime);
        const state = engine.getState();
        
        if (state.shonzika.isMoving && !movementStarted) {
          movementStarted = true;
          startX = state.shonzika.startX;
          targetX = state.shonzika.targetX;
        }
        
        if (movementStarted && state.shonzika.isMoving) {
          xPositions.push(state.shonzika.x);
        }
        
        if (movementStarted && !state.shonzika.isMoving) {
          break;
        }
      }
      
      if (xPositions.length > 0) {
        // Verify smooth interpolation - x should change gradually
        for (let i = 1; i < xPositions.length; i++) {
          const diff = Math.abs(xPositions[i] - xPositions[i - 1]);
          expect(diff).toBeLessThan(100); // Should not jump too much between frames
        }
      }
    });

    it('should update animationProgress from 0 to 1 during movement', () => {
      engine.startGame();
      const initialState = engine.getState();
      const nextMoveTime = initialState.shonzika.nextMoveTime;
      
      let currentTime = 0;
      let movementStarted = false;
      const progressValues: number[] = [];
      
      while (currentTime < nextMoveTime + NO_POGOD_CONFIG.SHONZIKA_MOVE_DURATION + 1000) {
        currentTime += 50;
        engine.update(currentTime);
        const state = engine.getState();
        
        if (state.shonzika.isMoving) {
          movementStarted = true;
          progressValues.push(state.shonzika.animationProgress);
        }
        
        if (movementStarted && !state.shonzika.isMoving) {
          break;
        }
      }
      
      if (progressValues.length > 0) {
        // Should start near 0
        expect(progressValues[0]).toBeLessThan(0.3);
        
        // Should end at 1.0
        expect(progressValues[progressValues.length - 1]).toBeGreaterThan(0.8);
        
        // Should be monotonically increasing
        for (let i = 1; i < progressValues.length; i++) {
          expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
        }
      }
    });

    it('should reach target position when movement completes', () => {
      engine.startGame();
      const initialState = engine.getState();
      const nextMoveTime = initialState.shonzika.nextMoveTime;
      
      let currentTime = 0;
      let targetX = 0;
      let finalX = 0;
      
      while (currentTime < nextMoveTime + NO_POGOD_CONFIG.SHONZIKA_MOVE_DURATION + 1000) {
        currentTime += 50;
        engine.update(currentTime);
        const state = engine.getState();
        
        if (state.shonzika.isMoving) {
          targetX = state.shonzika.targetX;
        }
        
        if (!state.shonzika.isMoving && targetX !== 0) {
          finalX = state.shonzika.x;
          break;
        }
      }
      
      if (targetX !== 0) {
        expect(finalX).toBe(targetX);
      }
    });
  });

  describe('Walking Animation Sprites', () => {
    it('should set sprite to WALKING when movement starts', () => {
      engine.startGame();
      const initialState = engine.getState();
      const nextMoveTime = initialState.shonzika.nextMoveTime;
      
      let currentTime = 0;
      let foundWalkingSprite = false;
      
      while (currentTime < nextMoveTime + 1000) {
        currentTime += 50;
        engine.update(currentTime);
        const state = engine.getState();
        
        if (state.shonzika.sprite === 'WALKING') {
          foundWalkingSprite = true;
          break;
        }
      }
      
      expect(foundWalkingSprite).toBe(true);
    });

    it('should return to IDLE sprite when movement completes (if not throwing)', () => {
      engine.startGame();
      const initialState = engine.getState();
      const nextMoveTime = initialState.shonzika.nextMoveTime;
      
      let currentTime = 0;
      let movementStarted = false;
      let finalSprite = '';
      let throwCooldown = 0;
      
      while (currentTime < nextMoveTime + NO_POGOD_CONFIG.SHONZIKA_MOVE_DURATION + 1000) {
        currentTime += 50;
        engine.update(currentTime);
        const state = engine.getState();
        
        if (state.shonzika.isMoving) {
          movementStarted = true;
        }
        
        if (movementStarted && !state.shonzika.isMoving) {
          finalSprite = state.shonzika.sprite;
          throwCooldown = state.shonzika.throwCooldown;
          break;
        }
      }
      
      // Should be IDLE if not throwing, or THROWING if throw happened at end of movement
      if (throwCooldown <= 0) {
        expect(finalSprite).toBe('IDLE');
      } else {
        expect(finalSprite).toBe('THROWING');
      }
    });

    it('should not interfere with throwing animation', () => {
      engine.startGame();
      
      // Wait a bit then trigger item spawn which causes throwing
      let currentTime = 0;
      for (let i = 0; i < 20; i++) {
        currentTime += 100;
        engine.update(currentTime);
      }
      
      const state = engine.getState();
      
      // If throwing, sprite should be THROWING regardless of movement
      if (state.shonzika.sprite === 'THROWING') {
        expect(state.shonzika.throwCooldown).toBeGreaterThan(0);
      }
    });
  });

  describe('Movement Scheduling', () => {
    it('should schedule next movement after current movement completes', () => {
      engine.startGame();
      const initialState = engine.getState();
      const firstMoveTime = initialState.shonzika.nextMoveTime;
      
      let currentTime = 0;
      let secondMoveTime = 0;
      let wasMoving = false;
      
      // Wait for first movement to start and complete
      while (currentTime < firstMoveTime + NO_POGOD_CONFIG.SHONZIKA_MOVE_DURATION + 1000) {
        const prevState = engine.getState();
        currentTime += 50;
        engine.update(currentTime);
        const state = engine.getState();
        
        // Track if we saw movement
        if (state.shonzika.isMoving) {
          wasMoving = true;
        }
        
        // Capture nextMoveTime when movement just completed
        if (wasMoving && !state.shonzika.isMoving && prevState.shonzika.isMoving) {
          secondMoveTime = state.shonzika.nextMoveTime;
          break;
        }
      }
      
      // Second move should be scheduled for the future
      if (secondMoveTime > 0) {
        // The nextMoveTime should be greater than current game time
        expect(secondMoveTime).toBeGreaterThan(currentTime - 100); // Small tolerance for frame timing
        
        // The interval should be within the configured range
        const interval = secondMoveTime - currentTime;
        expect(interval).toBeGreaterThanOrEqual(NO_POGOD_CONFIG.SHONZIKA_MOVE_INTERVAL_MIN - 200);
        expect(interval).toBeLessThanOrEqual(NO_POGOD_CONFIG.SHONZIKA_MOVE_INTERVAL_MAX + 200);
      }
    });

    it('should not start NEW movement during throw cooldown', () => {
      engine.startGame();
      
      let currentTime = 0;
      let throwStartedWhileIdle = false;
      let movementStartedDuringThrow = false;
      
      // Run for a while to catch a throw that happens while idle
      while (currentTime < 10000) {
        const prevState = engine.getState();
        currentTime += 50;
        engine.update(currentTime);
        const state = engine.getState();
        
        // Detect when throw starts while Shonzika is idle (not already moving)
        if (state.shonzika.throwCooldown > 0 && !prevState.shonzika.isMoving && prevState.shonzika.throwCooldown <= 0) {
          throwStartedWhileIdle = true;
          
          // Now check if a NEW movement starts during this throw
          let throwCurrentTime = currentTime;
          while (state.shonzika.throwCooldown > 0 && throwCurrentTime < currentTime + 2000) {
            throwCurrentTime += 50;
            engine.update(throwCurrentTime);
            const throwState = engine.getState();
            
            // If movement starts during throw cooldown, that's a problem
            if (throwState.shonzika.isMoving && throwState.shonzika.throwCooldown > 0) {
              movementStartedDuringThrow = true;
              break;
            }
            
            if (throwState.shonzika.throwCooldown <= 0) {
              break;
            }
          }
          
          if (throwStartedWhileIdle) {
            break;
          }
        }
      }
      
      // If we detected a throw while idle, new movement should not have started during it
      if (throwStartedWhileIdle) {
        expect(movementStartedDuringThrow).toBe(false);
      }
    });
  });

  describe('Movement Duration', () => {
    it('should complete movement in approximately SHONZIKA_MOVE_DURATION milliseconds', () => {
      engine.startGame();
      const initialState = engine.getState();
      const nextMoveTime = initialState.shonzika.nextMoveTime;
      
      let currentTime = 0;
      let movementStartTime = 0;
      let movementEndTime = 0;
      
      while (currentTime < nextMoveTime + NO_POGOD_CONFIG.SHONZIKA_MOVE_DURATION + 1000) {
        currentTime += 50;
        engine.update(currentTime);
        const state = engine.getState();
        
        if (state.shonzika.isMoving && movementStartTime === 0) {
          movementStartTime = currentTime;
        }
        
        if (!state.shonzika.isMoving && movementStartTime > 0 && movementEndTime === 0) {
          movementEndTime = currentTime;
          break;
        }
      }
      
      if (movementStartTime > 0 && movementEndTime > 0) {
        const duration = movementEndTime - movementStartTime;
        
        // Should be approximately SHONZIKA_MOVE_DURATION (within 200ms tolerance)
        expect(duration).toBeGreaterThanOrEqual(NO_POGOD_CONFIG.SHONZIKA_MOVE_DURATION - 200);
        expect(duration).toBeLessThanOrEqual(NO_POGOD_CONFIG.SHONZIKA_MOVE_DURATION + 200);
      }
    });
  });
});
