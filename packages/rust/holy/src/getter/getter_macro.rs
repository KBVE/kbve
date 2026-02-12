use proc_macro::TokenStream;
use quote::quote;
use syn::{Data, DeriveInput, Field, Fields};

use crate::utils::{determine_visibility, should_skip};

pub fn impl_getters_macro(ast: &DeriveInput) -> Result<TokenStream, syn::Error> {
	let name = &ast.ident;
	let (impl_generics, ty_generics, where_clause) = ast.generics.split_for_impl();

	let getters = match &ast.data {
		Data::Struct(data) => match &data.fields {
			Fields::Named(fields) => fields
				.named
				.iter()
				.filter(|f| !should_skip(&f.attrs))
				.map(|f| generate_getter(f))
				.collect::<Result<Vec<_>, syn::Error>>()?,
			_ => {
				return Err(syn::Error::new_spanned(
					ast,
					"Getters macro only supports structs with named fields",
				));
			}
		},
		_ => {
			return Err(syn::Error::new_spanned(
				ast,
				"Getters macro only supports structs",
			));
		}
	};

	let expanded = quote! {
		impl #impl_generics #name #ty_generics #where_clause {
			#(#getters)*
		}
	};

	Ok(TokenStream::from(expanded))
}

fn generate_getter(field: &Field) -> Result<proc_macro2::TokenStream, syn::Error> {
	let field_name = &field.ident;
	let field_type = &field.ty;
	let vis = &field.vis;
	let getter_vis = determine_visibility(vis, &field.attrs)?;

	let getter = quote! {
		#getter_vis fn #field_name(&self) -> &#field_type {
			&self.#field_name
		}
	};

	Ok(getter)
}
