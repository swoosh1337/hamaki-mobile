---
description: How to add a new feature following clean architecture
---

# New Feature Development Workflow

Follow these steps in order when adding a new feature:

## 1. Define Types
Create type definitions in `types/[feature].ts`:
```typescript
// types/[feature].ts
export interface FeatureEntity {
  id: string;
  // ... properties
}

export interface CreateFeatureInput {
  // ... input properties
}
```

## 2. Create Service
Add data access in `services/supabase/[feature]Service.ts`:
```typescript
// services/supabase/[feature]Service.ts
export const featureService = {
  async getAll(): Promise<FeatureEntity[]> { /* ... */ },
  async create(input: CreateFeatureInput): Promise<FeatureEntity> { /* ... */ },
};
```

## 3. Add Service Tests
// turbo
```bash
touch __tests__/services/[feature]Service.test.ts
```

## 4. Create Custom Hook
Add state management in `hooks/use[Feature].ts`:
```typescript
// hooks/use[Feature].ts
export function useFeature() {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  // ... implementation
  return { data, isLoading, error, refetch };
}
```

## 5. Add Hook Tests
// turbo
```bash
touch __tests__/hooks/use[Feature].test.ts
```

## 6. Create Components
Add UI in `components/[feature]/`:
- `[Feature]Card.tsx` - Individual item display
- `[Feature]List.tsx` - List container
- `Create[Feature]Modal.tsx` - Creation form

## 7. Add Component Tests
// turbo
```bash
touch __tests__/components/[Feature]Card.test.tsx
```

## 8. Wire Up Screen
Integrate in `app/(tabs)/[feature].tsx` or existing screen.

## 9. Add Screen Test
// turbo
```bash
touch __tests__/screens/[Feature]Screen.test.tsx
```

## 10. Add E2E Test (if critical path)
// turbo
```bash
touch __tests__/e2e/[feature].spec.ts
```

## 11. Run All Tests
// turbo
```bash
npm test && npm run test:e2e
```

## Checklist
- [ ] Types defined
- [ ] Service created
- [ ] Service tests passing
- [ ] Hook created
- [ ] Hook tests passing
- [ ] Components created
- [ ] Component tests passing
- [ ] Screen integrated
- [ ] Screen test passing
- [ ] E2E test (if applicable)
