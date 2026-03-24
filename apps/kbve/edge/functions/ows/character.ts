import {
  createServiceClient,
  jsonResponse,
  requireAdmin,
  validateCharName,
  validateUuid,
  type OwsRequest,
} from "./_shared.ts";

export const CHARACTER_ACTIONS = [
  "unstuck",
  "reset_stats",
  "lookup",
  "list",
  "create",
  "delete",
  "set_admin",
];

export async function handleCharacter(req: OwsRequest): Promise<Response> {
  const adminErr = requireAdmin(req.claims);
  if (adminErr) return adminErr;

  switch (req.action) {
    case "unstuck":
      return unstuck(req);
    case "reset_stats":
      return resetStats(req);
    case "lookup":
      return lookup(req);
    case "list":
      return list(req);
    case "create":
      return create(req);
    case "delete":
      return remove(req);
    case "set_admin":
      return setAdmin(req);
    default:
      return jsonResponse(
        {
          error: `Unknown action: ${req.action}. Available: ${CHARACTER_ACTIONS.join(", ")}`,
        },
        400,
      );
  }
}

// ---------------------------------------------------------------------------
// character.unstuck
//
// Moves a character back to the default spawn point for their map.
// Clears CharOnMapInstance so OWS reassigns them on next login.
//
// Body: { customer_guid, char_name }
// ---------------------------------------------------------------------------
async function unstuck(req: OwsRequest): Promise<Response> {
  const { customer_guid, char_name } = req.body as {
    customer_guid?: string;
    char_name?: string;
  };

  const guidErr = validateUuid(customer_guid, "customer_guid");
  if (guidErr) return guidErr;
  const nameErr = validateCharName(char_name, "char_name");
  if (nameErr) return nameErr;

  const sb = createServiceClient();

  const { data: character, error: charErr } = await sb
    .schema("ows")
    .from("characters")
    .select("characterid, mapname, x, y, z")
    .eq("customerguid", customer_guid!)
    .eq("charname", char_name!)
    .single();

  if (charErr || !character) {
    return jsonResponse(
      { error: `Character '${char_name}' not found` },
      404,
    );
  }

  const { data: defaults, error: defErr } = await sb
    .schema("ows")
    .from("defaultcharactervalues")
    .select("startingmapname, x, y, z, rx, ry, rz")
    .eq("customerguid", customer_guid!)
    .limit(1)
    .single();

  if (defErr || !defaults) {
    return jsonResponse(
      { error: "No default spawn point configured for this customer" },
      404,
    );
  }

  const { error: updateErr } = await sb
    .schema("ows")
    .from("characters")
    .update({
      mapname: defaults.startingmapname,
      x: defaults.x,
      y: defaults.y,
      z: defaults.z,
      rx: defaults.rx,
      ry: defaults.ry,
      rz: defaults.rz,
      serverip: null,
      lastactivity: new Date().toISOString(),
    })
    .eq("customerguid", customer_guid!)
    .eq("characterid", character.characterid);

  if (updateErr) {
    console.error("unstuck update error:", updateErr.message);
    return jsonResponse({ error: "Failed to update character position" }, 500);
  }

  // Clear CharOnMapInstance so OWS reassigns on next login
  const { error: clearErr } = await sb
    .schema("ows")
    .from("charonmapinstance")
    .delete()
    .eq("customerguid", customer_guid!)
    .eq("characterid", character.characterid);

  if (clearErr) {
    console.error("unstuck clear map instance error:", clearErr.message);
  }

  return jsonResponse({
    ok: true,
    character: char_name,
    moved_to: {
      map: defaults.startingmapname,
      x: defaults.x,
      y: defaults.y,
      z: defaults.z,
    },
    previous: {
      map: character.mapname,
      x: character.x,
      y: character.y,
      z: character.z,
    },
  });
}

// ---------------------------------------------------------------------------
// character.reset_stats
//
// Resets a character's combat/resource stats to zero defaults.
// Does NOT touch position, inventory, or custom data.
//
// Body: { customer_guid, char_name }
// ---------------------------------------------------------------------------
async function resetStats(req: OwsRequest): Promise<Response> {
  const { customer_guid, char_name } = req.body as {
    customer_guid?: string;
    char_name?: string;
  };

  const guidErr = validateUuid(customer_guid, "customer_guid");
  if (guidErr) return guidErr;
  const nameErr = validateCharName(char_name, "char_name");
  if (nameErr) return nameErr;

  const sb = createServiceClient();

  const { data: character, error: charErr } = await sb
    .schema("ows")
    .from("characters")
    .select("characterid")
    .eq("customerguid", customer_guid!)
    .eq("charname", char_name!)
    .single();

  if (charErr || !character) {
    return jsonResponse(
      { error: `Character '${char_name}' not found` },
      404,
    );
  }

  const { error: updateErr } = await sb
    .schema("ows")
    .from("characters")
    .update({
      health: 0,
      maxhealth: 0,
      mana: 0,
      maxmana: 0,
      energy: 0,
      maxenergy: 0,
      stamina: 0,
      maxstamina: 0,
      endurance: 0,
      maxendurance: 0,
      fatigue: 0,
      maxfatigue: 0,
      wounds: 0,
      gold: 0,
      silver: 0,
      copper: 0,
      xp: 0,
      characterlevel: 0,
      lastactivity: new Date().toISOString(),
    })
    .eq("customerguid", customer_guid!)
    .eq("characterid", character.characterid);

  if (updateErr) {
    console.error("reset_stats error:", updateErr.message);
    return jsonResponse({ error: "Failed to reset character stats" }, 500);
  }

  return jsonResponse({
    ok: true,
    character: char_name,
    message: "Stats reset to defaults. Position and inventory unchanged.",
  });
}

// ---------------------------------------------------------------------------
// character.lookup
//
// Returns full character info + custom data + map instance for admin inspection.
//
// Body: { customer_guid, char_name }
// ---------------------------------------------------------------------------
async function lookup(req: OwsRequest): Promise<Response> {
  const { customer_guid, char_name } = req.body as {
    customer_guid?: string;
    char_name?: string;
  };

  const guidErr = validateUuid(customer_guid, "customer_guid");
  if (guidErr) return guidErr;
  const nameErr = validateCharName(char_name, "char_name");
  if (nameErr) return nameErr;

  const sb = createServiceClient();

  const { data: character, error: charErr } = await sb
    .schema("ows")
    .from("characters")
    .select(
      "characterid, charname, userguid, email, mapname, x, y, z, rx, ry, rz, health, maxhealth, mana, maxmana, gold, silver, copper, xp, characterlevel, classid, lastactivity, createdate, isadmin, ismoderator, serverip",
    )
    .eq("customerguid", customer_guid!)
    .eq("charname", char_name!)
    .single();

  if (charErr || !character) {
    return jsonResponse(
      { error: `Character '${char_name}' not found` },
      404,
    );
  }

  const [mapInstanceRes, customDataRes] = await Promise.all([
    sb
      .schema("ows")
      .from("charonmapinstance")
      .select("mapinstanceid")
      .eq("customerguid", customer_guid!)
      .eq("characterid", character.characterid),
    sb
      .schema("ows")
      .from("customcharacterdata")
      .select("customfieldname, fieldvalue")
      .eq("customerguid", customer_guid!)
      .eq("characterid", character.characterid),
  ]);

  return jsonResponse({
    ok: true,
    character,
    custom_data: customDataRes.data ?? [],
    map_instances: mapInstanceRes.data ?? [],
  });
}

// ---------------------------------------------------------------------------
// character.list
//
// Lists all characters for a given user (by user_guid or email).
//
// Body: { customer_guid, user_guid?, email? }
// ---------------------------------------------------------------------------
async function list(req: OwsRequest): Promise<Response> {
  const { customer_guid, user_guid, email } = req.body as {
    customer_guid?: string;
    user_guid?: string;
    email?: string;
  };

  const guidErr = validateUuid(customer_guid, "customer_guid");
  if (guidErr) return guidErr;

  if (!user_guid && !email) {
    return jsonResponse(
      { error: "Either user_guid or email is required" },
      400,
    );
  }

  if (user_guid) {
    const userGuidErr = validateUuid(user_guid, "user_guid");
    if (userGuidErr) return userGuidErr;
  }

  const sb = createServiceClient();

  let query = sb
    .schema("ows")
    .from("characters")
    .select(
      "characterid, charname, userguid, email, mapname, x, y, z, characterlevel, classid, lastactivity, createdate, isadmin, ismoderator",
    )
    .eq("customerguid", customer_guid!);

  if (user_guid) {
    query = query.eq("userguid", user_guid);
  } else if (email) {
    query = query.eq("email", email);
  }

  const { data: characters, error: charErr } = await query.order(
    "createdate",
    { ascending: true },
  );

  if (charErr) {
    console.error("list error:", charErr.message);
    return jsonResponse({ error: "Failed to list characters" }, 500);
  }

  return jsonResponse({
    ok: true,
    count: characters?.length ?? 0,
    characters: characters ?? [],
  });
}

// ---------------------------------------------------------------------------
// character.create
//
// Admin-creates a character for a user, using DefaultCharacterValues for
// starting position and seeding default CustomCharacterData.
//
// Body: { customer_guid, user_guid, char_name, class_id? }
// ---------------------------------------------------------------------------
async function create(req: OwsRequest): Promise<Response> {
  const { customer_guid, user_guid, char_name, class_id } = req.body as {
    customer_guid?: string;
    user_guid?: string;
    char_name?: string;
    class_id?: number;
  };

  const guidErr = validateUuid(customer_guid, "customer_guid");
  if (guidErr) return guidErr;
  const userGuidErr = validateUuid(user_guid, "user_guid");
  if (userGuidErr) return userGuidErr;
  const nameErr = validateCharName(char_name, "char_name");
  if (nameErr) return nameErr;

  const sb = createServiceClient();

  // 1. Verify user exists
  const { data: user, error: userErr } = await sb
    .schema("ows")
    .from("users")
    .select("userguid, email")
    .eq("customerguid", customer_guid!)
    .eq("userguid", user_guid!)
    .single();

  if (userErr || !user) {
    return jsonResponse({ error: "User not found" }, 404);
  }

  // 2. Check char_name not already taken
  const { data: existing } = await sb
    .schema("ows")
    .from("characters")
    .select("characterid")
    .eq("customerguid", customer_guid!)
    .eq("charname", char_name!)
    .maybeSingle();

  if (existing) {
    return jsonResponse(
      { error: `Character name '${char_name}' is already taken` },
      409,
    );
  }

  // 3. Get default spawn values
  const { data: defaults, error: defErr } = await sb
    .schema("ows")
    .from("defaultcharactervalues")
    .select("defaultcharactervaluesid, startingmapname, x, y, z, rx, ry, rz")
    .eq("customerguid", customer_guid!)
    .limit(1)
    .single();

  if (defErr || !defaults) {
    return jsonResponse(
      { error: "No default character values configured" },
      404,
    );
  }

  // 4. Insert character
  const { data: newChar, error: insertErr } = await sb
    .schema("ows")
    .from("characters")
    .insert({
      customerguid: customer_guid,
      userguid: user_guid,
      email: user.email,
      charname: char_name,
      mapname: defaults.startingmapname,
      x: defaults.x,
      y: defaults.y,
      z: defaults.z,
      rx: defaults.rx,
      ry: defaults.ry,
      rz: defaults.rz,
      perception: 0,
      acrobatics: 0,
      climb: 0,
      stealth: 0,
      classid: class_id ?? 0,
    })
    .select("characterid")
    .single();

  if (insertErr || !newChar) {
    console.error("create character error:", insertErr?.message);
    return jsonResponse({ error: "Failed to create character" }, 500);
  }

  // 5. Seed default custom character data from DefaultCustomCharacterData
  const { data: defaultCustom } = await sb
    .schema("ows")
    .from("defaultcustomcharacterdata")
    .select("customfieldname, fieldvalue")
    .eq("customerguid", customer_guid!)
    .eq("defaultcharactervaluesid", defaults.defaultcharactervaluesid);

  if (defaultCustom && defaultCustom.length > 0) {
    const customRows = defaultCustom.map((d) => ({
      customerguid: customer_guid,
      characterid: newChar.characterid,
      customfieldname: d.customfieldname,
      fieldvalue: d.fieldvalue,
    }));

    const { error: customErr } = await sb
      .schema("ows")
      .from("customcharacterdata")
      .insert(customRows);

    if (customErr) {
      console.error("create custom data error:", customErr.message);
      // Non-fatal — character exists, custom data can be added later
    }
  }

  return jsonResponse({
    ok: true,
    character_id: newChar.characterid,
    char_name,
    map: defaults.startingmapname,
    position: { x: defaults.x, y: defaults.y, z: defaults.z },
  });
}

// ---------------------------------------------------------------------------
// character.delete
//
// Permanently deletes a character and all associated FK data.
// Deletion order respects FK constraints:
//   CharAbilityBarAbilities → CharAbilityBars → CharHasAbilities
//   CharInventoryItems → CharInventory
//   CharHasItems, CustomCharacterData, CharOnMapInstance,
//   PlayerGroupCharacters → Characters
//
// Body: { customer_guid, char_name, confirm: true }
// ---------------------------------------------------------------------------
async function remove(req: OwsRequest): Promise<Response> {
  const { customer_guid, char_name, confirm } = req.body as {
    customer_guid?: string;
    char_name?: string;
    confirm?: boolean;
  };

  const guidErr = validateUuid(customer_guid, "customer_guid");
  if (guidErr) return guidErr;
  const nameErr = validateCharName(char_name, "char_name");
  if (nameErr) return nameErr;

  if (confirm !== true) {
    return jsonResponse(
      { error: "Set confirm: true to permanently delete this character" },
      400,
    );
  }

  const sb = createServiceClient();

  const { data: character, error: charErr } = await sb
    .schema("ows")
    .from("characters")
    .select("characterid")
    .eq("customerguid", customer_guid!)
    .eq("charname", char_name!)
    .single();

  if (charErr || !character) {
    return jsonResponse(
      { error: `Character '${char_name}' not found` },
      404,
    );
  }

  const charId = character.characterid;
  const cg = customer_guid!;
  const deleted: Record<string, number> = {};

  // Helper: delete from a table and track count
  async function deleteFrom(
    table: string,
    filters: Record<string, unknown>,
  ): Promise<void> {
    let query = sb.schema("ows").from(table).delete({ count: "exact" });
    for (const [col, val] of Object.entries(filters)) {
      query = query.eq(col, val);
    }
    const { count, error } = await query;
    if (error) {
      console.error(`delete ${table} error:`, error.message);
    }
    deleted[table] = count ?? 0;
  }

  // 1. Get ability bar IDs for this character (needed for CharAbilityBarAbilities)
  const { data: bars } = await sb
    .schema("ows")
    .from("charabilitybars")
    .select("charabilitybarid")
    .eq("customerguid", cg)
    .eq("characterid", charId);

  if (bars && bars.length > 0) {
    const barIds = bars.map((b) => b.charabilitybarid);
    // Delete abilities in those bars
    const { count: barAbilCount, error: barAbilErr } = await sb
      .schema("ows")
      .from("charabilitybarabilities")
      .delete({ count: "exact" })
      .eq("customerguid", cg)
      .in("charabilitybarid", barIds);

    if (barAbilErr) {
      console.error("delete charabilitybarabilities error:", barAbilErr.message);
    }
    deleted["charabilitybarabilities"] = barAbilCount ?? 0;
  }

  // 2. Get inventory IDs for this character (needed for CharInventoryItems)
  const { data: invs } = await sb
    .schema("ows")
    .from("charinventory")
    .select("charinventoryid")
    .eq("customerguid", cg)
    .eq("characterid", charId);

  if (invs && invs.length > 0) {
    const invIds = invs.map((i) => i.charinventoryid);
    const { count: invItemCount, error: invItemErr } = await sb
      .schema("ows")
      .from("charinventoryitems")
      .delete({ count: "exact" })
      .eq("customerguid", cg)
      .in("charinventoryid", invIds);

    if (invItemErr) {
      console.error("delete charinventoryitems error:", invItemErr.message);
    }
    deleted["charinventoryitems"] = invItemCount ?? 0;
  }

  // 3. Delete remaining FK children in dependency order
  await deleteFrom("charabilitybars", { customerguid: cg, characterid: charId });
  await deleteFrom("charhasabilities", { customerguid: cg, characterid: charId });
  await deleteFrom("charhasitems", { customerguid: cg, characterid: charId });
  await deleteFrom("charinventory", { customerguid: cg, characterid: charId });
  await deleteFrom("customcharacterdata", { customerguid: cg, characterid: charId });
  await deleteFrom("charonmapinstance", { customerguid: cg, characterid: charId });
  await deleteFrom("playergroupcharacters", { customerguid: cg, characterid: charId });

  // 4. Delete the character itself
  await deleteFrom("characters", { customerguid: cg, characterid: charId });

  return jsonResponse({
    ok: true,
    character: char_name,
    character_id: charId,
    deleted,
  });
}

// ---------------------------------------------------------------------------
// character.set_admin
//
// Toggles IsAdmin and/or IsModerator flags on a character.
//
// Body: { customer_guid, char_name, is_admin?: boolean, is_moderator?: boolean }
// ---------------------------------------------------------------------------
async function setAdmin(req: OwsRequest): Promise<Response> {
  const { customer_guid, char_name, is_admin, is_moderator } = req.body as {
    customer_guid?: string;
    char_name?: string;
    is_admin?: boolean;
    is_moderator?: boolean;
  };

  const guidErr = validateUuid(customer_guid, "customer_guid");
  if (guidErr) return guidErr;
  const nameErr = validateCharName(char_name, "char_name");
  if (nameErr) return nameErr;

  if (is_admin === undefined && is_moderator === undefined) {
    return jsonResponse(
      { error: "At least one of is_admin or is_moderator must be provided" },
      400,
    );
  }

  const sb = createServiceClient();

  const { data: character, error: charErr } = await sb
    .schema("ows")
    .from("characters")
    .select("characterid, isadmin, ismoderator")
    .eq("customerguid", customer_guid!)
    .eq("charname", char_name!)
    .single();

  if (charErr || !character) {
    return jsonResponse(
      { error: `Character '${char_name}' not found` },
      404,
    );
  }

  const updates: Record<string, unknown> = {};
  if (is_admin !== undefined) updates.isadmin = is_admin;
  if (is_moderator !== undefined) updates.ismoderator = is_moderator;

  const { error: updateErr } = await sb
    .schema("ows")
    .from("characters")
    .update(updates)
    .eq("customerguid", customer_guid!)
    .eq("characterid", character.characterid);

  if (updateErr) {
    console.error("set_admin error:", updateErr.message);
    return jsonResponse({ error: "Failed to update admin flags" }, 500);
  }

  return jsonResponse({
    ok: true,
    character: char_name,
    previous: {
      is_admin: character.isadmin,
      is_moderator: character.ismoderator,
    },
    current: {
      is_admin: is_admin ?? character.isadmin,
      is_moderator: is_moderator ?? character.ismoderator,
    },
  });
}
