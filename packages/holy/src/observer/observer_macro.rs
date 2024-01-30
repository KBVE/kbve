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

pub fn impl_observer_macro(ast: &DeriveInput) -> Result<TokenStream, syn::Error> {


	let struct_name = &ast.ident;
    let fields = match &ast.data {
        Data::Struct(data) => &data.fields,
        _ => return Err(syn::Error::new_spanned(ast, "Observer macro only supports structs")),
    };

	let observer_fields = fields.iter().filter_map(|f| {
		if has_observer_attribute(f) {
			let field_name = f.ident.as_ref().unwrap();
			// Generate the observer field identifier
			let observer_field_ident = syn::Ident::new(&format!("{}_observers", field_name), field_name.span());
			Some(quote! {
				pub #observer_field_ident: crossbeam::atomic::AtomicCell<Option<Box<dyn Fn(&#struct_name) + Send + Sync>>>
			})
		} else {
			None
		}
	});
	
	let observer_methods = fields.iter().filter_map(|f| {
		if has_observer_attribute(f) {
			let field_name = f.ident.as_ref().unwrap();
			// Generate the observer field identifier for use in method
			let observer_field_ident = syn::Ident::new(&format!("{}_observers", field_name), field_name.span());
			let add_observer_method_name = syn::Ident::new(&format!("add_{}_observer", field_name), field_name.span());
			Some(quote! {
				pub fn #add_observer_method_name<F>(&self, observer: F)
				where F: Fn(&#struct_name) + 'static + Send + Sync {
					self.#observer_field_ident.store(Some(Box::new(observer)));
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




// Helper function to check for the observer attribute
pub fn has_observer_attribute(field: &Field) -> bool {
    field.attrs.iter().any(|attr| attr.path.is_ident("holy"))
}