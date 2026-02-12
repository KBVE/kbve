
use quote::quote;


use syn::{
    Visibility,
    Attribute,
    Meta,
	NestedMeta,
};


pub fn determine_visibility(
	vis: &Visibility,
	attrs: &[Attribute]
) -> Result<proc_macro2::TokenStream, syn::Error> {
	if
		let Some(override_vis) = attrs
			.iter()
			.find(|attr| attr.path.is_ident("holy"))
			.and_then(parse_visibility_override)
	{
		Ok(override_vis)
	} else {
		match vis {
			Visibility::Public(_) => Ok(quote! { pub }),
			Visibility::Restricted(restricted) =>
				Ok(quote! { pub(#restricted) }),
			_ => Ok(quote! {}),
		}
	}
}

pub fn parse_visibility_override(
	attr: &Attribute
) -> Option<proc_macro2::TokenStream> {
	attr.parse_meta()
		.ok()
		.and_then(|meta| {
			if let Meta::List(meta_list) = meta {
				for nested_meta in meta_list.nested.iter() {
					match nested_meta {
						NestedMeta::Meta(Meta::Path(path)) if
							path.is_ident("public")
						=> {
							return Some(quote! { pub });
						}
						NestedMeta::Meta(Meta::Path(path)) if
							path.is_ident("private")
						=> {
							return Some(quote! {});
						}
						_ => {
							continue;
						}
					}
				}
			}
			None
		})
}
