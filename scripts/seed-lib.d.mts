import type pg from 'pg'

export function upsertAuthUser(client: pg.Client, email: string, password: string): Promise<string>
export function upsertShop(client: pg.Client, shop: { name: string; isDemo: boolean; currency?: string; timezone?: string }): Promise<string>
export function upsertMembership(client: pg.Client, shopId: string, userId: string, role: 'owner' | 'staff'): Promise<void>
export function seedDemoShop(client: pg.Client, users: { ownerId: string; staffId: string }): Promise<{ shopId: string; productsInserted: number }>
export function seedLiveShop(client: pg.Client, shop: { name: string; ownerId: string; currency?: string; timezone?: string }): Promise<string>
