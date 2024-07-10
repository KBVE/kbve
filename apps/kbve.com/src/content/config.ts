import { z, defineCollection } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';

//*			[Prompt Schemas]

const FunctionSchema = z.object({
	name: z.string(),
	description: z.string(),
	parameters: z.object({
	  type: z.literal("object"),
	  properties: z.record(
		z.object({
		  type: z.string(),
		  description: z.string(),
		})
	  ),
	  required: z.array(z.string()),
	}),
  });
  
  const ToolSchema = z.object({
	type: z.literal("function"),
	function: FunctionSchema,
  });
  
  const PathwaySchema = z.object({
	condition: z.string(),
	action: z.string(),
  });
  
  const PromptPathwaysSchema = z.record(
	z.object({
	  prompt: z.string(),
	  next: z.array(PathwaySchema),
	})
  );
  
  const PromptSchema = z.object({
	name: z.string(),
	description: z.string(),
	items: z.array(z.string()),
	task: z.string(),
	tools: z.array(ToolSchema).optional(),
	output: z.enum(["text", "json"]),
	pathways: PromptPathwaysSchema,
	ulid: z.string(),
  });

export type Prompt = z.infer<typeof PromptSchema>;
export type Tool = z.infer<typeof ToolSchema>;
export type Function = z.infer<typeof FunctionSchema>;
export type Pathway = z.infer<typeof PathwaySchema>;
export type PromptPathways = z.infer<typeof PromptPathwaysSchema>;

//*         [Emil SF Docs]
const productsCollection = defineCollection({
	type: 'content',
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			main: z.object({
				id: z.number(),
				content: z.string(),
				imgCard: image(),
				imgMain: image(),
				imgAlt: z.string(),
			}),
			tabs: z.array(
				z.object({
					id: z.string(),
					dataTab: z.string(),
					title: z.string(),
				}),
			),
			longDescription: z.object({
				title: z.string(),
				subTitle: z.string(),
				btnTitle: z.string(),
				btnURL: z.string(),
			}),
			descriptionList: z.array(
				z.object({
					title: z.string(),
					subTitle: z.string(),
				}),
			),
			specificationsLeft: z.array(
				z.object({
					title: z.string(),
					subTitle: z.string(),
				}),
			),
			specificationsRight: z
				.array(
					z.object({
						title: z.string(),
						subTitle: z.string(),
					}),
				)
				.optional(),
			tableData: z
				.array(
					z.object({
						feature: z.array(z.string()),
						description: z.array(z.array(z.string())),
					}),
				)
				.optional(),
			blueprints: z.object({
				first: image().optional(),
				second: image().optional(),
			}),
		}),
});

const blogCollection = defineCollection({
	type: 'content',
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			contents: z.array(z.string()),
			author: z.string(),
			role: z.string().optional(),
			authorImage: image(),
			authorImageAlt: z.string(),
			pubDate: z.date(),
			cardImage: image(),
			cardImageAlt: z.string(),
			readTime: z.number(),
			tags: z.array(z.string()).optional(),
		}),
});

const insightsCollection = defineCollection({
	type: 'content',
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			// contents: z.array(z.string()),
			cardImage: image(),
			cardImageAlt: z.string(),
		}),
});


//*         [Arcade]

const arcade = defineCollection({
	schema: z.object({
		title: z.string(),
		status: z.boolean().optional(),
		description: z.string(),
		tags: z.array(z.string()),
		footnote: z.string().optional(),
		author: z.string().default('KBVE Team'),
		img: z.string().default(''),
		date: z.string().optional(),
		url: z.string().optional(),
		icon: z.string().default('https://kbve.com/favicon.svg'),
		unsplash: z.string().optional(),
		swf: z.string().optional(),
		featured: z.boolean().default(false),
		draft: z.boolean().default(false),
		house: z.boolean().default(false),
		promoted: z.boolean().default(false),
		ipfs: z.string().optional(),
	}),
});

//*         [Assets]

//?         {Journal}
const journal = defineCollection({
	schema: z.object({
		title: z.string(),
		description: z.string(),
		tags: z.array(z.string()),
		footnote: z.string().optional(),
		author: z.string().default('KBVE Team'),
		role: z.string().default('KBVE Member'),
		unsplash: z.string().default(''),
		img: z.string().default(''),
		date: z.date().optional(),
		url: z.string().optional(),
	}),
});



//*         [Comic]
const comic = defineCollection({
	schema: z.object({
		title: z.string(),
		description: z.string(),
		tags: z.array(z.string()),
		category: z.string(),
		series: z.string(),
		npc: z.string(),
		footnote: z.string().optional(),
		author: z.string().default('KBVE Team'),
		unsplash: z.string().default(''),
		img: z.string().default(''),
		date: z.string().optional(),
		url: z.string().optional(),
		information: z.string().optional(),
		media: z.any().optional(),
		lottie: z.string().optional(),
	}),
});


const statSchema = z.object({
	title: z.string().optional(),
	data: z.string().optional(),
	html: z.string().optional(),
});
  

const NPCPositionSchema = z.object({
	x: z.number(),
	y: z.number(),
	z: z.number().optional(),
	d: z.number().optional(),
  });

const PlayerStatsSchema = z.object({
	health: z.number(),
	mana: z.number(),
  });

const NPCDataSchema = z.object({
	id: z.string(),
	name: z.string(),
	spriteKey: z.string(),
	walkingAnimationMapping: z.number(),
	startPosition: NPCPositionSchema,
	speed: z.number(),
	scale: z.number(),
	actions: z.array(z.enum(['talk', 'quest', 'trade', 'combat', 'heal', 'steal'])),
	effects: z.array(z.string()).optional(),
	stats: PlayerStatsSchema.optional(),
	spriteImageId: z.string().optional(),
	avatarImageId: z.string().optional(),
  });

const SpriteSchema = z.object({
	id: z.string(), // Assuming the ULID is validated elsewhere
	spriteName: z.string(),
	assetLocation: z.string(),
	frameWidth: z.number(),
	frameHeight: z.number(),
	scale: z.number().optional(),
	spriteData: z.instanceof(Blob).optional(),
  });

const AvatarSchema = z.object({
	id: z.string(), // Assuming the ULID is validated elsewhere
	avatarLocation: z.string(),
	avatarData: z.instanceof(Blob).optional(),
});
  

const bonusesSchema = z.object({
  armor: z.number().optional(),
  intelligence: z.number().optional(),
  health: z.number().optional(),
  mana: z.number().optional(),
});

const IObjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  category: z.string().optional(),
  description: z.string().optional(),
  img: z.string().optional(),
  bonuses: bonusesSchema.optional(),
  durability: z.number().optional(),
  weight: z.number().optional(),
  equipped: z.boolean().optional(),
  consumable: z.boolean().optional(),
  effects: z.string().optional(),
  stackable: z.boolean().optional(),
  rarity: z.string().optional(),
  levelRequirement: z.number().optional(),
  price: z.number().optional(),
  cooldown: z.number().optional(),
  action: z.string().optional(),
  craftingMaterials: z.array(z.string()).optional(),
  credits: z.string().optional(),
});

export const collections = {
	arcade: arcade,
	journal: journal,
	comic: comic,
	docs: defineCollection({
		schema: docsSchema({
			extend: z.object({
				unsplash: z.string().optional(),
				tags: z.array(z.string()).optional(),
				"yt-tracks" : z.array(z.string()).optional(),
				"yt-sets": z.array(z.string()).optional(),
				prompts: z.array(PromptSchema).optional(),
				"prompt-index": z.string().optional(),
				stats: z.array(statSchema).optional(),
				img: z.string().optional(),
				lottie: z.string().optional(),
				button: z.string().optional(),
				itemdb: z.array(IObjectSchema).optional(),
			}),
		}),
	}),
	products: productsCollection,
	blog: blogCollection,
	insights: insightsCollection,
};
