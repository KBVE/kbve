use proc_macro::TokenStream;
use quote::quote;
use syn::{
	parse_macro_input,
	parse_quote,
	DeriveInput,
	Data,
	Fields,
	Visibility,
	Field,
	Attribute,
	Lit,
	Meta,
	NestedMeta,
	Ident,
};

use crate::utils::determine_visibility;
use crate::observer::has_observer_attribute;

pub fn impl_setters_macro(ast: &DeriveInput) -> Result<TokenStream, syn::Error> {
	let name = &ast.ident;
	let setters = match &ast.data {
		Data::Struct(data) => {
			match &data.fields {
				Fields::Named(fields) => {
					fields.named
						.iter()
						.map(|f| { generate_setter(f) })
						.collect::<Result<Vec<_>, syn::Error>>()?
				}
				_ => {
					return Err(
						syn::Error::new_spanned(
							&ast,
							"Setters macro only supports structs with named fields"
						)
					);
				}
			}
		}
		_ => {
			return Err(
				syn::Error::new_spanned(
					&ast,
					"Setters macro only supports structs"
				)
			);
		}
	};

	let expanded =
		quote! {
        impl #name {
            #(#setters)*
        }
    };

	Ok(TokenStream::from(expanded))
}

fn generate_setter(
	field: &Field
) -> Result<proc_macro2::TokenStream, syn::Error> {
	let field_name = field.ident
		.as_ref()
		.ok_or_else(|| syn::Error::new_spanned(field, "Field without a name"))?;
	let field_type = &field.ty;
	let vis = &field.vis;
	let setter_name = syn::Ident::new(
		&format!("set_{}", field_name),
		field_name.span()
	);
	let setter_vis = determine_visibility(vis, &field.attrs)?;

	 // Check if the field has an observer and generate the notification logic
	 let observer_check = if has_observer_attribute(field) {
        let observer_field_name = syn::Ident::new(&format!("{}_observers", field_name), field_name.span());
        quote! {
            if let Some(observer) = self.#observer_field_name.load() {
                (observer)(self);
            }
        }
    } else {
        quote! {}
    };


	let setter =
		quote! {
        #setter_vis fn #setter_name(&mut self, value: #field_type) {
            self.#field_name = value;
        }
    };

	Ok(setter)
}