use quote::quote;
use syn::{Attribute, Meta, Token, Visibility};
use syn::parse::Parser;
use syn::punctuated::Punctuated;

pub fn determine_visibility(
	vis: &Visibility,
	attrs: &[Attribute],
) -> Result<proc_macro2::TokenStream, syn::Error> {
	if let Some(override_vis) = attrs
		.iter()
		.find(|attr| attr.path().is_ident("holy"))
		.and_then(parse_visibility_override)
	{
		Ok(override_vis)
	} else {
		match vis {
			Visibility::Public(_) => Ok(quote! { pub }),
			Visibility::Restricted(restricted) => Ok(quote! { #restricted }),
			Visibility::Inherited => Ok(quote! {}),
		}
	}
}

fn parse_visibility_override(attr: &Attribute) -> Option<proc_macro2::TokenStream> {
	let Meta::List(meta_list) = &attr.meta else {
		return None;
	};

	let nested = Punctuated::<Meta, Token![,]>::parse_terminated
		.parse2(meta_list.tokens.clone())
		.ok()?;

	for meta in &nested {
		if let Meta::Path(path) = meta {
			if path.is_ident("public") {
				return Some(quote! { pub });
			}
			if path.is_ident("private") {
				return Some(quote! {});
			}
		}
	}
	None
}

pub fn should_skip(attrs: &[Attribute]) -> bool {
	has_holy_argument(attrs, "skip")
}

pub fn has_holy_argument(attrs: &[Attribute], arg_name: &str) -> bool {
	attrs.iter().any(|attr| {
		if !attr.path().is_ident("holy") {
			return false;
		}
		let Meta::List(meta_list) = &attr.meta else {
			return false;
		};
		let Ok(nested) = Punctuated::<Meta, Token![,]>::parse_terminated
			.parse2(meta_list.tokens.clone())
		else {
			return false;
		};
		nested
			.iter()
			.any(|meta| matches!(meta, Meta::Path(path) if path.is_ident(arg_name)))
	})
}
