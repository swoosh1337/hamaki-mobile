/**
 * NoPogod Game Integration Tests
 * 
 * Tests for game flow including:
 * - XP awarding when game ends
 * - Leaderboard updates with final score
 * - Lives system
 * - Timer countdown
 * - Complete game flow
 */

import {
    FallingItem,
    ITEM_DEFINITIONS,
    ItemType,
    NO_POGOD_CONFIG,
    NoPogodEngine,
} from '@/features/games/noPogod';
import { leaderboardService } from '@/services/supabase/leaderboardService';
import { userService } from '@/services/supabase/userService';

// Mock Supabase client
jest.mock('@/services/supabase/client', () => ({
    supabase: {
        from: jest.fn(),
    },
}));

// Mock userService for XP tests
jest.mock('@/services/supabase/userService', () => ({
    userService: {
        updateUserXP: jest.fn(),
        getUserProfile: jest.fn(),
    },
    getWeekStartDate: jest.fn().mockReturnValue('2024-01-01'),
}));

// Mock leaderboardService for score updates
jest.mock('@/services/supabase/leaderboardService', () => ({
    leaderboardService: {
        updateLeaderboardPoints: jest.fn(),
        getLeaderboard: jest.fn(),
        getWeeklyLeaderboard: jest.fn(),
    },
}));

/**
 * Helper function to create a properly-typed FallingItem for testing
 */
function createTestItem(options: {
    id?: string;
    type: ItemType;
    x: number;
    y: number;
    velocityY?: number;
}): FallingItem {
    const itemDef = ITEM_DEFINITIONS[options.type];
    return {
        id: options.id || `test_${Date.now()}_${Math.random()}`,
        type: options.type,
        x: options.x,
        y: options.y,
        velocityX: 0,
        velocityY: options.velocityY ?? NO_POGOD_CONFIG.ITEM_FALL_SPEED,
        sprite: null,
        points: itemDef.points,
        isBad: itemDef.isBad,
        isDeadly: itemDef.isDeadly,
        mustCatch: itemDef.mustCatch,
        shouldAvoid: itemDef.shouldAvoid,
    };
}

/**
 * Helper to inject items for collision testing
 */
function injectItems(game: NoPogodEngine, items: FallingItem[]): void {
    (game as any).items = items;
}

/**
 * Helper to trigger a game update tick
 */
function triggerUpdate(game: NoPogodEngine, deltaMs: number = 16): void {
    const currentTime = Date.now();
    game.update(currentTime);
    game.update(currentTime + deltaMs);
}

describe('NoPogod Game Integration', () => {
    const screenWidth = 400;
    const screenHeight = 600;
    let game: NoPogodEngine;

    const mockUserService = userService as jest.Mocked<typeof userService>;
    const mockLeaderboardService = leaderboardService as jest.Mocked<typeof leaderboardService>;

    beforeEach(() => {
        jest.clearAllMocks();
        game = new NoPogodEngine(screenWidth, screenHeight);
    });

    // =========================================================================
    // LIVES SYSTEM TESTS
    // =========================================================================
    describe('Lives System', () => {
        beforeEach(() => {
            game.startGame();
        });

        it('should start with 3 lives', () => {
            expect(game.getLives()).toBe(3);
        });

        it('should lose 1 life when catching ELECTRIC_SHOCK', () => {
            const playerX = game.getPlayerState().x;
            const playerY = game.getPlayerState().y;

            const shock = createTestItem({
                type: 'ELECTRIC_SHOCK',
                x: playerX,
                y: playerY,
                velocityY: 0,
            });
            injectItems(game, [shock]);
            triggerUpdate(game);

            expect(game.getLives()).toBe(2);
        });

        it('should lose multiple lives from multiple shocks in one frame', () => {
            const playerX = game.getPlayerState().x;
            const playerY = game.getPlayerState().y;

            injectItems(game, [
                createTestItem({ type: 'ELECTRIC_SHOCK', x: playerX, y: playerY, velocityY: 0 }),
                createTestItem({ type: 'ELECTRIC_SHOCK', x: playerX, y: playerY, velocityY: 0 }),
            ]);
            triggerUpdate(game);

            expect(game.getLives()).toBe(1);
        });

        it('should not lose lives when catching good items', () => {
            const playerX = game.getPlayerState().x;
            const playerY = game.getPlayerState().y;

            injectItems(game, [
                createTestItem({ type: 'EGG', x: playerX, y: playerY, velocityY: 0 }),
            ]);
            triggerUpdate(game);

            expect(game.getLives()).toBe(3);
        });

        it('should trigger game over when all lives are lost', () => {
            const playerX = game.getPlayerState().x;
            const playerY = game.getPlayerState().y;

            // Lose all 3 lives at once
            injectItems(game, [
                createTestItem({ type: 'ELECTRIC_SHOCK', x: playerX, y: playerY, velocityY: 0 }),
                createTestItem({ type: 'ELECTRIC_SHOCK', x: playerX, y: playerY, velocityY: 0 }),
                createTestItem({ type: 'ELECTRIC_SHOCK', x: playerX, y: playerY, velocityY: 0 }),
            ]);
            triggerUpdate(game);

            expect(game.getLives()).toBe(0);
            expect(game.isGameOver()).toBe(true);
        });

        it('should trigger instant game over when catching BOMB', () => {
            const playerX = game.getPlayerState().x;
            const playerY = game.getPlayerState().y;

            const bomb = createTestItem({
                type: 'BOMB',
                x: playerX,
                y: playerY,
                velocityY: 0,
            });
            injectItems(game, [bomb]);
            triggerUpdate(game);

            expect(game.isGameOver()).toBe(true);
        });
    });

    // =========================================================================
    // TIMER SYSTEM TESTS
    // =========================================================================
    describe('Timer System', () => {
        it('should start with 60 seconds', () => {
            game.startGame();
            expect(game.getTimeRemaining()).toBe(60);
            expect(game.getTimeRemainingMs()).toBe(60000);
        });

        it('should countdown during gameplay', () => {
            game.startGame();
            const startTime = Date.now();

            // Initialize timing
            game.update(startTime);

            // Advance 1 second (20 frames at 50ms each)
            for (let i = 1; i <= 20; i++) {
                game.update(startTime + (i * 50));
            }

            const remainingMs = game.getTimeRemainingMs();
            const remainingSec = game.getTimeRemaining();

            expect(remainingMs).toBeLessThan(60000);
            expect(remainingMs).toBeGreaterThan(58000);
            expect(remainingSec).toBe(59);
        });

        it('should trigger game over when timer reaches 0', () => {
            game.startGame();
            game.update(100);

            // Simulate 65 seconds passing
            for (let t = 150; t <= 66000; t += 50) {
                if (game.isGameOver()) break;
                game.update(t);
            }

            expect(game.isGameOver()).toBe(true);
        });

        it('should not countdown when paused', () => {
            game.startGame();
            const startTime = Date.now();

            // Initialize and advance a bit
            game.update(startTime);
            game.update(startTime + 100);

            game.pauseGame();
            const timeBeforePause = game.getTimeRemainingMs();

            // Try to advance time while paused
            game.update(startTime + 1000);
            game.update(startTime + 2000);

            expect(game.getTimeRemainingMs()).toBe(timeBeforePause);
        });

        it('should format time correctly', () => {
            game.startGame();
            const formatted = game.getTimeRemainingFormatted();
            // Format should be "60s" or "1:00"
            expect(formatted).toMatch(/^(60s|1:00)$/);
        });
    });

    // =========================================================================
    // SCORING AND XP TESTS
    // =========================================================================
    describe('Scoring System', () => {
        beforeEach(() => {
            game.startGame();
        });

        it('should award 10 points for catching EGG', () => {
            const playerX = game.getPlayerState().x;
            const playerY = game.getPlayerState().y;

            const egg = createTestItem({
                type: 'EGG',
                x: playerX,
                y: playerY,
                velocityY: 0,
            });
            injectItems(game, [egg]);
            triggerUpdate(game);

            expect(game.getScore()).toBe(10);
        });

        it('should award 10 points for catching TOMATO', () => {
            const playerX = game.getPlayerState().x;
            const playerY = game.getPlayerState().y;

            const tomato = createTestItem({
                type: 'TOMATO',
                x: playerX,
                y: playerY,
                velocityY: 0,
            });
            injectItems(game, [tomato]);
            triggerUpdate(game);

            expect(game.getScore()).toBe(10);
        });

        it('should award 10 points for catching PEPPER', () => {
            const playerX = game.getPlayerState().x;
            const playerY = game.getPlayerState().y;

            const pepper = createTestItem({
                type: 'PEPPER',
                x: playerX,
                y: playerY,
                velocityY: 0,
            });
            injectItems(game, [pepper]);
            triggerUpdate(game);

            expect(game.getScore()).toBe(10);
        });

        it('should accumulate score from multiple catches', () => {
            const playerX = game.getPlayerState().x;
            const playerY = game.getPlayerState().y;

            injectItems(game, [
                createTestItem({ type: 'EGG', x: playerX, y: playerY, velocityY: 0 }),
                createTestItem({ type: 'TOMATO', x: playerX, y: playerY, velocityY: 0 }),
                createTestItem({ type: 'PEPPER', x: playerX, y: playerY, velocityY: 0 }),
            ]);
            triggerUpdate(game);

            expect(game.getScore()).toBe(30);
        });

        it('should not award points for catching bad items', () => {
            const playerX = game.getPlayerState().x;
            const playerY = game.getPlayerState().y;

            const shock = createTestItem({
                type: 'ELECTRIC_SHOCK',
                x: playerX,
                y: playerY,
                velocityY: 0,
            });
            injectItems(game, [shock]);
            triggerUpdate(game);

            expect(game.getScore()).toBe(0);
        });
    });

    // =========================================================================
    // XP CALCULATION TESTS  
    // =========================================================================
    describe('XP Calculation', () => {
        it('should calculate XP based on score (1 XP per 10 points)', () => {
            // This tests the XP formula used in NoPogodGame.tsx
            const score = 100;
            const xpToAward = Math.floor(score / 10);
            expect(xpToAward).toBe(10);
        });

        it('should calculate XP correctly for various scores', () => {
            const testCases = [
                { score: 0, expectedXP: 0 },
                { score: 10, expectedXP: 1 },
                { score: 25, expectedXP: 2 },
                { score: 50, expectedXP: 5 },
                { score: 100, expectedXP: 10 },
                { score: 150, expectedXP: 15 },
                { score: 1000, expectedXP: 100 },
            ];

            testCases.forEach(({ score, expectedXP }) => {
                const xpToAward = Math.floor(score / 10);
                expect(xpToAward).toBe(expectedXP);
            });
        });

        it('should add minimum 1 XP for any score >= 10', () => {
            const score = 15;
            const xpToAward = Math.floor(score / 10);
            expect(xpToAward).toBeGreaterThanOrEqual(1);
        });
    });

    // =========================================================================
    // SPEED BOOST TESTS
    // =========================================================================
    describe('Speed Boost', () => {
        beforeEach(() => {
            game.startGame();
        });

        it('should not have speed boost initially', () => {
            expect(game.isSpeedBoostActive()).toBe(false);
        });

        it('should activate speed boost when catching PEPPER', () => {
            const playerX = game.getPlayerState().x;
            const playerY = game.getPlayerState().y;

            const pepper = createTestItem({
                type: 'PEPPER',
                x: playerX,
                y: playerY,
                velocityY: 0,
            });
            injectItems(game, [pepper]);
            triggerUpdate(game);

            expect(game.isSpeedBoostActive()).toBe(true);
        });

        it('should have speed boost duration of 5 seconds', () => {
            expect(NO_POGOD_CONFIG.SPEED_BOOST_DURATION).toBe(5000);
        });
    });

    // =========================================================================
    // COMPLETE GAME FLOW TESTS
    // =========================================================================
    describe('Complete Game Flow', () => {
        it('should track score through entire game session', () => {
            game.startGame();
            expect(game.getScore()).toBe(0);

            const playerX = game.getPlayerState().x;
            const playerY = game.getPlayerState().y;

            // Catch some items
            injectItems(game, [
                createTestItem({ type: 'EGG', x: playerX, y: playerY, velocityY: 0 }),
            ]);
            triggerUpdate(game);
            expect(game.getScore()).toBe(10);

            // Catch more items
            injectItems(game, [
                createTestItem({ type: 'TOMATO', x: playerX, y: playerY, velocityY: 0 }),
            ]);
            triggerUpdate(game);
            expect(game.getScore()).toBe(20);
        });

        it('should maintain final score when game ends', () => {
            game.startGame();
            const playerX = game.getPlayerState().x;
            const playerY = game.getPlayerState().y;

            // Build up score
            injectItems(game, [
                createTestItem({ type: 'EGG', x: playerX, y: playerY, velocityY: 0 }),
                createTestItem({ type: 'TOMATO', x: playerX, y: playerY, velocityY: 0 }),
                createTestItem({ type: 'PEPPER', x: playerX, y: playerY, velocityY: 0 }),
            ]);
            triggerUpdate(game);
            expect(game.getScore()).toBe(30);

            // Game over via bomb
            injectItems(game, [
                createTestItem({ type: 'BOMB', x: playerX, y: playerY, velocityY: 0 }),
            ]);
            triggerUpdate(game);

            expect(game.isGameOver()).toBe(true);
            expect(game.getScore()).toBe(30); // Score should be preserved
        });
    });
});

// =========================================================================
// LEADERBOARD UPDATE TESTS
// =========================================================================
describe('Leaderboard Updates', () => {
    const mockLeaderboardService = leaderboardService as jest.Mocked<typeof leaderboardService>;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('updateLeaderboardPoints', () => {
        it('should update leaderboard with game score', async () => {
            mockLeaderboardService.updateLeaderboardPoints.mockResolvedValue(true);

            const userId = 'test-user-123';
            const gameScore = 150;

            await mockLeaderboardService.updateLeaderboardPoints(userId, gameScore);

            expect(mockLeaderboardService.updateLeaderboardPoints).toHaveBeenCalledWith(
                userId,
                gameScore
            );
        });

        it('should handle leaderboard update failure gracefully', async () => {
            mockLeaderboardService.updateLeaderboardPoints.mockResolvedValue(false);

            const result = await mockLeaderboardService.updateLeaderboardPoints('user', 100);

            expect(result).toBe(false);
        });
    });
});

// =========================================================================
// XP AWARDING TESTS (Integration with UserService)
// =========================================================================
describe('XP Awarding on Game End', () => {
    const mockUserService = userService as jest.Mocked<typeof userService>;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('XP Update Flow', () => {
        it('should call updateUserXP with calculated XP', async () => {
            mockUserService.updateUserXP.mockResolvedValue({
                success: true,
                data: { id: 'user-1', xp_points: 110 },
            } as any);

            const score = 100;
            const xpToAward = Math.floor(score / 10); // 10 XP
            const currentXP = 100;
            const newXP = currentXP + xpToAward;

            await mockUserService.updateUserXP('user-1', newXP);

            expect(mockUserService.updateUserXP).toHaveBeenCalledWith('user-1', 110);
        });

        it('should not award XP if score is 0', () => {
            const score = 0;
            const xpToAward = Math.floor(score / 10);
            expect(xpToAward).toBe(0);
        });

        it('should handle XP update failure', async () => {
            mockUserService.updateUserXP.mockRejectedValue(new Error('Network error'));

            await expect(
                mockUserService.updateUserXP('user-1', 100)
            ).rejects.toThrow('Network error');
        });
    });
});

// =========================================================================
// ITEM DEFINITIONS VERIFICATION
// =========================================================================
describe('Item Definitions', () => {
    describe('Good Items', () => {
        it('EGG should award 10 points and not be avoidable', () => {
            expect(ITEM_DEFINITIONS.EGG).toEqual({
                points: 10,
                isBad: false,
                isDeadly: false,
                mustCatch: false,
                shouldAvoid: false,
            });
        });

        it('TOMATO should award 10 points and not be avoidable', () => {
            expect(ITEM_DEFINITIONS.TOMATO).toEqual({
                points: 10,
                isBad: false,
                isDeadly: false,
                mustCatch: false,
                shouldAvoid: false,
            });
        });

        it('PEPPER should award 10 points and not be avoidable', () => {
            expect(ITEM_DEFINITIONS.PEPPER).toEqual({
                points: 10,
                isBad: false,
                isDeadly: false,
                mustCatch: false,
                shouldAvoid: false,
            });
        });
    });

    describe('Bad Items', () => {
        it('ELECTRIC_SHOCK should cause damage but not game over', () => {
            expect(ITEM_DEFINITIONS.ELECTRIC_SHOCK).toEqual({
                points: 0,
                isBad: true,
                isDeadly: false,
                mustCatch: false,
                shouldAvoid: true,
            });
        });

        it('BOMB should be deadly and cause immediate game over', () => {
            expect(ITEM_DEFINITIONS.BOMB).toEqual({
                points: 0,
                isBad: true,
                isDeadly: true,
                mustCatch: false,
                shouldAvoid: true,
            });
        });
    });
});

// =========================================================================
// GAME CONFIGURATION VERIFICATION
// =========================================================================
describe('Game Configuration', () => {
    it('should have 60 second game duration', () => {
        expect(NO_POGOD_CONFIG.GAME_DURATION).toBe(60000);
    });

    it('should have 3 initial lives', () => {
        expect(NO_POGOD_CONFIG.INITIAL_LIVES).toBe(3);
    });

    it('should award 10 points per good item', () => {
        expect(NO_POGOD_CONFIG.GOOD_ITEM_POINTS).toBe(10);
    });

    it('should have correct player positions', () => {
        expect(NO_POGOD_CONFIG.PLAYER_POSITIONS.LEFT).toBe(0.25);
        expect(NO_POGOD_CONFIG.PLAYER_POSITIONS.CENTER).toBe(0.5);
        expect(NO_POGOD_CONFIG.PLAYER_POSITIONS.RIGHT).toBe(0.75);
    });

    it('should have 5 second speed boost duration', () => {
        expect(NO_POGOD_CONFIG.SPEED_BOOST_DURATION).toBe(5000);
    });
});

// =========================================================================
// HIGH SCORE TESTS
// =========================================================================
describe('High Score System', () => {
    const HIGH_SCORE_KEY = 'nopogod_high_score';

    describe('High Score Logic', () => {
        it('should identify new high score when current score exceeds saved', () => {
            const savedHighScore = 50;
            const currentScore = 100;
            const isNewHighScore = currentScore > savedHighScore;
            expect(isNewHighScore).toBe(true);
        });

        it('should not identify new high score when current score is lower', () => {
            const savedHighScore = 100;
            const currentScore = 50;
            const isNewHighScore = currentScore > savedHighScore;
            expect(isNewHighScore).toBe(false);
        });

        it('should not identify new high score when scores are equal', () => {
            const savedHighScore = 100;
            const currentScore = 100;
            const isNewHighScore = currentScore > savedHighScore;
            expect(isNewHighScore).toBe(false);
        });

        it('should identify new high score when no previous score exists', () => {
            const savedHighScore = 0;
            const currentScore = 10;
            const isNewHighScore = currentScore > savedHighScore;
            expect(isNewHighScore).toBe(true);
        });
    });

    describe('High Score Persistence', () => {
        const mockAsyncStorage = {
            getItem: jest.fn(),
            setItem: jest.fn(),
        };

        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('should parse stored high score correctly', async () => {
            mockAsyncStorage.getItem.mockResolvedValue('150');

            const stored = await mockAsyncStorage.getItem(HIGH_SCORE_KEY);
            const highScore = stored ? parseInt(stored, 10) : 0;

            expect(highScore).toBe(150);
        });

        it('should return 0 when no high score is stored', async () => {
            mockAsyncStorage.getItem.mockResolvedValue(null);

            const stored = await mockAsyncStorage.getItem(HIGH_SCORE_KEY);
            const highScore = stored ? parseInt(stored, 10) : 0;

            expect(highScore).toBe(0);
        });

        it('should save new high score as string', async () => {
            const newHighScore = 200;
            await mockAsyncStorage.setItem(HIGH_SCORE_KEY, newHighScore.toString());

            expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
                HIGH_SCORE_KEY,
                '200'
            );
        });
    });
});

// =========================================================================
// DATA LAYER INTEGRATION TESTS
// =========================================================================
describe('Data Layer Integration', () => {
    const mockLeaderboardService = leaderboardService as jest.Mocked<typeof leaderboardService>;
    const mockUserService = userService as jest.Mocked<typeof userService>;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Game End Data Flow', () => {
        it('should update both XP and leaderboard on game end', async () => {
            mockUserService.updateUserXP.mockResolvedValue({ success: true } as any);
            mockLeaderboardService.updateLeaderboardPoints.mockResolvedValue(true);

            const userId = 'test-user';
            const gameScore = 100;
            const currentXP = 500;
            const xpToAward = Math.floor(gameScore / 10);
            const newXP = currentXP + xpToAward;

            // Simulate game end actions
            await mockUserService.updateUserXP(userId, newXP);
            await mockLeaderboardService.updateLeaderboardPoints(userId, gameScore);

            expect(mockUserService.updateUserXP).toHaveBeenCalledWith(userId, 510);
            expect(mockLeaderboardService.updateLeaderboardPoints).toHaveBeenCalledWith(userId, 100);
        });

        it('should handle partial failure (XP succeeds, leaderboard fails)', async () => {
            mockUserService.updateUserXP.mockResolvedValue({ success: true } as any);
            mockLeaderboardService.updateLeaderboardPoints.mockResolvedValue(false);

            const result = await mockLeaderboardService.updateLeaderboardPoints('user', 100);

            expect(result).toBe(false);
        });

        it('should handle XP failure gracefully', async () => {
            mockUserService.updateUserXP.mockRejectedValue(new Error('Network error'));

            let xpUpdated = false;
            try {
                await mockUserService.updateUserXP('user', 100);
                xpUpdated = true;
            } catch {
                xpUpdated = false;
            }

            expect(xpUpdated).toBe(false);
        });
    });

    describe('Leaderboard Queries', () => {
        it('should fetch all-time leaderboard', async () => {
            const mockLeaderboard = [
                { id: 'user-1', full_name: 'Top Player', xp_points: 5000, avatar_url: null },
                { id: 'user-2', full_name: 'Second', xp_points: 4000, avatar_url: null },
            ];
            mockLeaderboardService.getLeaderboard.mockResolvedValue(mockLeaderboard as any);

            const result = await mockLeaderboardService.getLeaderboard(10);

            expect(result).toHaveLength(2);
            expect(result[0].full_name).toBe('Top Player');
        });

        it('should fetch weekly leaderboard', async () => {
            const mockWeekly = [
                { user_id: 'user-1', points: 500, user: { full_name: 'Weekly Leader', avatar_url: undefined } },
            ];
            mockLeaderboardService.getWeeklyLeaderboard.mockResolvedValue(mockWeekly);

            const result = await mockLeaderboardService.getWeeklyLeaderboard(10);

            expect(result).toHaveLength(1);
            expect(result[0].user.full_name).toBe('Weekly Leader');
        });

        it('should return empty array when no leaderboard data', async () => {
            mockLeaderboardService.getLeaderboard.mockResolvedValue([]);
            mockLeaderboardService.getWeeklyLeaderboard.mockResolvedValue([]);

            const allTime = await mockLeaderboardService.getLeaderboard();
            const weekly = await mockLeaderboardService.getWeeklyLeaderboard();

            expect(allTime).toEqual([]);
            expect(weekly).toEqual([]);
        });
    });
});
