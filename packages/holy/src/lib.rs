// lib.rs

extern crate proc_macro;
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

#[proc_macro_derive(Getters, attributes(holy))]
pub fn getters_derive(input: TokenStream) -> TokenStream {
	let ast = parse_macro_input!(input as DeriveInput);
	impl_getters_macro(&ast).unwrap_or_else(|e| e.to_compile_error().into())
}

fn impl_getters_macro(ast: &DeriveInput) -> Result<TokenStream, syn::Error> {
	let name = &ast.ident;
	let getters = match &ast.data {
		Data::Struct(data) => {
			match &data.fields {
				Fields::Named(fields) => {
					fields.named
						.iter()
						.map(|f| { generate_getter(f) })
						.collect::<Result<Vec<_>, syn::Error>>()?
				}
				_ => {
					return Err(
						syn::Error::new_spanned(
							&ast,
							"Getters macro only supports structs with named fields"
						)
					);
				}
			}
		}
		_ => {
			return Err(
				syn::Error::new_spanned(
					&ast,
					"Getters macro only supports structs"
				)
			);
		}
	};

	let expanded =
		quote! {
        impl #name {
            #(#getters)*
        }
    };

	Ok(TokenStream::from(expanded))
}

fn generate_getter(
	field: &Field
) -> Result<proc_macro2::TokenStream, syn::Error> {
	let field_name = &field.ident;
	let field_type = &field.ty;
	let vis = &field.vis;
	let getter_vis = determine_visibility(vis, &field.attrs)?;

	let getter =
		quote! {
        #getter_vis fn #field_name(&self) -> &#field_type {
            &self.#field_name
        }
    };

	Ok(getter)
}


#[proc_macro_derive(Observer, attributes(holy))]
pub fn observer_derive(input: TokenStream) -> TokenStream {
    let ast = parse_macro_input!(input as DeriveInput);
	impl_observer_macro(&ast).unwrap_or_else(|e| e.to_compile_error().into())

}


fn impl_observer_macro(ast: &DeriveInput) -> Result<TokenStream, syn::Error> {


	let struct_name = &ast.ident;
    let fields = match &ast.data {
        Data::Struct(data) => &data.fields,
        _ => return Err(Error::new_spanned(ast, "Observer macro only supports structs")),
    };

	// Generating fields for observer storage
	   let observer_fields = fields.iter().filter_map(|f| {
        if has_observer_attribute(f) {
            let field_name = f.ident.as_ref().unwrap();
            let observer_field_ident: Ident = parse_quote!(#field_name_observers);
            Some(quote! {
                pub #observer_field_ident: crossbeam::atomic::AtomicCell<Option<Box<dyn Fn(&#struct_name) + Send + Sync>>>
            })
        } else {
            None
        }
    });


	// Generating methods to add observers
    let observer_methods = fields.iter().filter_map(|f| {
        if has_observer_attribute(f) {
            let field_name = f.ident.as_ref().unwrap();
            let add_observer_ident: Ident = parse_quote!(add_#field_name_observer);
            Some(quote! {
                pub fn #add_observer_ident<F>(&self, observer: F)
                where F: Fn(&#struct_name) + 'static + Send + Sync {
                    self.#field_name_observers.store(Some(Box::new(observer)));
                }
            })
        } else {
            None
        }
    });

	// Generating the impl block
	let expanded = quote! {
        impl #struct_name {
            #(#observer_fields)*
            #(#observer_methods)*
        }
    };

    Ok(TokenStream::from(expanded))
}


#[proc_macro_derive(Setters, attributes(holy))]
pub fn setters_derive(input: TokenStream) -> TokenStream {
	let ast = parse_macro_input!(input as DeriveInput);
	impl_setters_macro(&ast).unwrap_or_else(|e| e.to_compile_error().into())
}

fn impl_setters_macro(ast: &DeriveInput) -> Result<TokenStream, syn::Error> {
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

fn determine_visibility(
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

fn parse_visibility_override(
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

// Helper function to check for the observer attribute
fn has_observer_attribute(field: &Field) -> bool {
    field.attrs.iter().any(|attr| attr.path.is_ident("holy"))
}