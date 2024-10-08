//  zodschema.ts
//  [IMPORTS]
import { z } from 'zod';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { UserCard, IObject, IPlayerStats, IQuest, ITask, INPCData, IMapData } from '../types';

// Define a Zod schema for SocialLinks
export const SocialLinksSchema = z.object({
  twitter: z.string().url().optional(),
  github: z.string().url().optional(),
  linkedin: z.string().url().optional(),
  website: z.string().url().optional(),
});

// Define a Zod schema for StyleSettings
export const StyleSettingsSchema = z.object({
  colors: z.array(z.string().regex(/^#[A-Fa-f0-9]{8}$/, 'Invalid hex color format')).max(10).optional(),
  cover: z.string().optional(),
  background: z.string().optional(),
});

// Define a Zod schema for UserCard
export const UserCardSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(5).max(24).regex(/^[a-zA-Z0-9_-]+$/, 'Invalid username format'),
  bio: z.string().max(255).optional(),
  socials: SocialLinksSchema.optional(),
  style: StyleSettingsSchema.optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Schema for IObject type
export const IObjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  category: z.string().optional(),
  description: z.string().optional(),
  img: z.string().optional(),
  bonuses: z.record(z.string().optional()).optional(),
  durability: z.string().optional(),
  weight: z.string().optional(),
  equipped: z.boolean().optional(),
  consumable: z.boolean().optional(),
  cooldown: z.string().optional(),
  slug: z.string().optional(),
  craftingMaterials: z.array(z.string()).optional(),
  rarity: z.string().optional(),
});

// IEquipment Schema - Extends IObjectSchema
export const IEquipmentSchema = IObjectSchema.extend({
  type: z.enum(['head', 'body', 'legs', 'feet', 'hands', 'weapon', 'shield', 'accessory']),
});

// IPlayerStats Schema
export const IPlayerStatsSchema = z.object({
  username: z.string(),
  health: z.string(),
  mana: z.string(),
  energy: z.string(),
  maxHealth: z.string(),
  maxMana: z.string(),
  maxEnergy: z.string(),
  armour: z.string(),
  agility: z.string(),
  strength: z.string(),
  intelligence: z.string(),
  experience: z.string(),
  reputation: z.string(),
  faith: z.string(),
});

// ITask Schema
export const ITaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  isComplete: z.boolean(),
  action: z.any(),
});

// IJournal Schema
export const IJournalSchema = z.object({
  id: z.string(),
  title: z.string(),
  tasks: z.array(ITaskSchema),
  isComplete: z.boolean(),
});

// IQuest Schema
export const IQuestSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  journals: z.array(IJournalSchema),
  isComplete: z.boolean(),
  reward: z.string(),
});

// INPCData Schema
export const INPCDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  spriteKey: z.string(),
  walkingAnimationMapping: z.number(),
  startPosition: z.object({
    x: z.number(),
    y: z.number(),
  }),
  speed: z.number(),
  scale: z.number(),
  slug: z.string(),
  actions: z.array(z.enum(['talk', 'quest', 'trade', 'combat', 'heal', 'steal', 'lore'])),
  effects: z.array(z.string()).optional(),
  stats: IPlayerStatsSchema.optional(),
  spriteImageId: z.string().optional(),
  avatarImageId: z.string().optional(),
  dialogues: z
    .array(
      z.object({
        dialogueId: z.string(),
        read: z.boolean(),
        priority: z.number(),
      })
    )
    .optional(),
});

// Define schemas for base types
export const PointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const BoundsSchema = z.object({
  xMin: z.number(),
  xMax: z.number(),
  yMin: z.number(),
  yMax: z.number(),
});

// MetaData Schema
export const MetaDataSchema = z.object({
  __actionId: z.string(),
  __data: z.string(),
  __error: z.string(),
  __message: z.string(),
});

// ErrorLog Schema
export const ErrorLogSchema = z.object({
  id: z.number().optional(),
  actionId: z.string().optional(),
  message: z.string(),
  details: z.any().optional(),
  timestamp: z.date(),
});

// ActionULID Schema
export const ActionULIDSchema = z.object({
  id: z.string(),
  action: z.string(),
  timestamp: z.date(),
  status: z.enum(['pending', 'completed', 'failed']),
  errorId: z.number().optional(),
});

// IPlayerState Schema
export const IPlayerStateSchema = z.object({
  inCombat: z.boolean(),
  isDead: z.boolean(),
  isResting: z.boolean(),
  activeBoosts: z.record(
    z.object({
      duration: z.number(),
      expiry: z.number().optional(),
    })
  ),
});

// IPlayerInventory Schema
export const IPlayerInventorySchema = z.object({
  backpack: z.array(z.string()),
  equipment: z.object({
    head: z.string().nullable(),
    body: z.string().nullable(),
    legs: z.string().nullable(),
    feet: z.string().nullable(),
    hands: z.string().nullable(),
    weapon: z.string().nullable(),
    shield: z.string().nullable(),
    accessory: z.string().nullable(),
  }),
});

// IPlayerData Schema
export const IPlayerDataSchema = z.object({
  stats: IPlayerStatsSchema,
  inventory: IPlayerInventorySchema,
  state: IPlayerStateSchema,
});

// IMapData Schema
export const IMapDataSchema = z.object({
  bounds: BoundsSchema,
  tilemapKey: z.string(),
  tilesetName: z.string(),
  tilesetLayer: z.string(),
  tilesetImageUrl: z.string(),
  tilesetKey: z.string(),
  scale: z.number(),
  npcs: z.array(
    z.object({
      ulid: z.string(),
      position: PointSchema,
    })
  ),
  jsonDataUrl: z.string(),
});

// NotificationType Schema
export const NotificationTypeSchema = z.object({
  type: z.enum(['caution', 'warning', 'danger', 'success', 'info']),
  color: z.string(),
  imgUrl: z.string(),
});

// INotification Schema
export const INotificationSchema = z.object({
  id: z.number(),
  title: z.string(),
  message: z.string(),
  notificationType: NotificationTypeSchema,
});

// UILoginState Schema
export const UILoginStateSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  actionId: z.string(),
  captchaToken: z.string(),
  error_message: z.string(),
  successful_message: z.string(),
});

// UIRegisterState Schema
export const UIRegisterStateSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  confirm: z.string(),
  username: z.string(),
  captchaToken: z.string(),
  svelte_internal_message: z.string(),
  successful_message: z.string(),
});

// Auth Schema
export const AuthSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  updatedAt: z.date(),
});

// UserProfile Schema
export const UserProfileSchema = AuthSchema.extend({
  fullName: z.string().optional(),
  username: z.string().optional(),
});
