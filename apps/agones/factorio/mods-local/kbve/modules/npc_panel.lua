local NpcPanel = {}

local function sprite_or_nil(path)
	if path and helpers and helpers.is_valid_sprite_path and helpers.is_valid_sprite_path(path) then
		return path
	end
	return nil
end

function NpcPanel.render(panel, npc, line, name_prefix)
	panel.clear()
	panel.style.minimal_width = 240
	panel.style.maximal_width = 260
	panel.style.padding = 4
	panel.style.vertical_spacing = 6

	local portrait_frame = panel.add({
		type = 'frame',
		name = name_prefix .. 'portrait_frame',
		style = 'inside_deep_frame',
		direction = 'vertical',
	})
	portrait_frame.style.padding = 2
	portrait_frame.style.minimal_width = 224
	portrait_frame.style.maximal_width = 244

	local portrait_path = sprite_or_nil(npc.portrait)
	if portrait_path then
		local portrait = portrait_frame.add({
			type = 'sprite',
			name = name_prefix .. 'portrait',
			sprite = portrait_path,
		})
		portrait.style.minimal_width = 220
		portrait.style.minimal_height = 320
		portrait.style.stretch_image_to_widget_size = true
	else
		local placeholder = portrait_frame.add({
			type = 'label',
			name = name_prefix .. 'portrait',
			caption = '[portrait pending]',
		})
		placeholder.style.minimal_width = 220
		placeholder.style.minimal_height = 320
		placeholder.style.horizontal_align = 'center'
		placeholder.style.vertical_align = 'center'
		placeholder.style.font_color = { r = 0.6, g = 0.7, b = 1 }
	end

	local name_row = panel.add({
		type = 'flow',
		direction = 'horizontal',
	})
	name_row.style.horizontal_spacing = 6
	name_row.add({
		type = 'label',
		name = name_prefix .. 'name',
		caption = npc.name,
		style = 'heading_2_label',
	})
	local sep = name_row.add({
		type = 'label',
		caption = '|',
	})
	sep.style.font_color = { r = 0.4, g = 0.45, b = 0.55 }
	name_row.add({
		type = 'label',
		name = name_prefix .. 'role',
		caption = npc.role,
	}).style.font_color = { r = 0.75, g = 0.82, b = 1 }

	local dialog_frame = panel.add({
		type = 'frame',
		name = name_prefix .. 'dialog_frame',
		style = 'inside_shallow_frame',
		direction = 'vertical',
	})
	dialog_frame.style.padding = 6
	dialog_frame.style.minimal_height = 70
	dialog_frame.style.minimal_width = 224
	dialog_frame.style.maximal_width = 244

	local dialog = dialog_frame.add({
		type = 'label',
		name = name_prefix .. 'dialog',
		caption = line,
	})
	dialog.style.single_line = false
	dialog.style.maximal_width = 224
	dialog.style.font = 'default-semibold'
end

return NpcPanel
