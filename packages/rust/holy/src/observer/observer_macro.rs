use proc_macro::TokenStream;
use quote::quote;
use syn::{Data, DeriveInput, Fields};

use crate::utils::has_holy_argument;

pub fn impl_observer_macro(ast: &DeriveInput) -> Result<TokenStream, syn::Error> {
	let struct_name = &ast.ident;
	let (_impl_generics, ty_generics, _where_clause) = ast.generics.split_for_impl();

	let fields = match &ast.data {
		Data::Struct(data) => match &data.fields {
			Fields::Named(named) => &named.named,
			_ => {
				return Err(syn::Error::new_spanned(
					ast,
					"Observer macro only supports structs with named fields",
				));
			}
		},
		_ => {
			return Err(syn::Error::new_spanned(
				ast,
				"Observer macro only supports structs",
			));
		}
	};

	let observed: Vec<_> = fields
		.iter()
		.filter(|f| has_holy_argument(&f.attrs, "observe"))
		.collect();

	if observed.is_empty() {
		return Ok(TokenStream::from(quote! {}));
	}

	let companion_name =
		syn::Ident::new(&format!("{}Observers", struct_name), struct_name.span());

	let storage_fields = observed.iter().map(|f| {
		let name = f.ident.as_ref().unwrap();
		let observer_field =
			syn::Ident::new(&format!("{}_observers", name), name.span());
		quote! {
			pub #observer_field: Vec<Box<dyn Fn(&#struct_name #ty_generics) + Send + Sync>>
		}
	});

	let storage_defaults = observed.iter().map(|f| {
		let name = f.ident.as_ref().unwrap();
		let observer_field =
			syn::Ident::new(&format!("{}_observers", name), name.span());
		quote! { #observer_field: Vec::new() }
	});

	let add_methods = observed.iter().map(|f| {
		let name = f.ident.as_ref().unwrap();
		let observer_field =
			syn::Ident::new(&format!("{}_observers", name), name.span());
		let method_name =
			syn::Ident::new(&format!("add_{}_observer", name), name.span());
		quote! {
			pub fn #method_name<F>(&mut self, observer: F)
			where
				F: Fn(&#struct_name #ty_generics) + 'static + Send + Sync,
			{
				self.#observer_field.push(Box::new(observer));
			}
		}
	});

	let notify_methods = observed.iter().map(|f| {
		let name = f.ident.as_ref().unwrap();
		let observer_field =
			syn::Ident::new(&format!("{}_observers", name), name.span());
		let method_name =
			syn::Ident::new(&format!("notify_{}_observers", name), name.span());
		quote! {
			pub fn #method_name(&self, target: &#struct_name #ty_generics) {
				for observer in &self.#observer_field {
					observer(target);
				}
			}
		}
	});

	let expanded = quote! {
		pub struct #companion_name {
			#(#storage_fields,)*
		}

		impl #companion_name {
			pub fn new() -> Self {
				Self {
					#(#storage_defaults,)*
				}
			}

			#(#add_methods)*
			#(#notify_methods)*
		}

		impl Default for #companion_name {
			fn default() -> Self {
				Self::new()
			}
		}
	};

	Ok(TokenStream::from(expanded))
}
