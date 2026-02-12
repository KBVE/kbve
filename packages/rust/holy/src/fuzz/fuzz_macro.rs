use proc_macro::TokenStream;
use quote::quote;
use syn::{Data, DeriveInput, Fields, Type};

use crate::utils::get_holy_string_value;

enum FuzzStrategy {
	Ascii(usize, usize),
	AlphanumericStr(usize, usize),
	Range(String, String),
}

enum FuzzTypeKind {
	String,
	Bool,
	Integer,
	Float,
	Other(String),
}

fn classify_fuzz_type(ty: &Type) -> FuzzTypeKind {
	if let Type::Path(type_path) = ty {
		if let Some(segment) = type_path.path.segments.last() {
			let ident = segment.ident.to_string();
			return match ident.as_str() {
				"String" => FuzzTypeKind::String,
				"bool" => FuzzTypeKind::Bool,
				"i8" | "i16" | "i32" | "i64" | "u8" | "u16" | "u32" | "u64" | "isize"
				| "usize" => FuzzTypeKind::Integer,
				"f32" | "f64" => FuzzTypeKind::Float,
				other => FuzzTypeKind::Other(other.to_string()),
			};
		}
	}
	FuzzTypeKind::Other("unknown".to_string())
}

fn parse_two_args(inner: &str, name: &str, span: proc_macro2::Span) -> Result<(String, String), syn::Error> {
	let parts: Vec<&str> = inner.splitn(2, ',').collect();
	if parts.len() != 2 {
		return Err(syn::Error::new(
			span,
			format!("{} requires two arguments: {}(a, b)", name, name),
		));
	}
	Ok((parts[0].trim().to_string(), parts[1].trim().to_string()))
}

fn parse_fuzz_strategy(
	raw: &str,
	span: proc_macro2::Span,
) -> Result<FuzzStrategy, syn::Error> {
	let trimmed = raw.trim();

	if let Some(inner) = trimmed.strip_prefix("ascii(").and_then(|s| s.strip_suffix(')')) {
		let (a, b) = parse_two_args(inner, "ascii", span)?;
		let min: usize = a.parse().map_err(|_| {
			syn::Error::new(span, format!("invalid ascii min length: '{}'", a))
		})?;
		let max: usize = b.parse().map_err(|_| {
			syn::Error::new(span, format!("invalid ascii max length: '{}'", b))
		})?;
		return Ok(FuzzStrategy::Ascii(min, max));
	}

	if let Some(inner) = trimmed
		.strip_prefix("alphanumeric(")
		.and_then(|s| s.strip_suffix(')'))
	{
		let (a, b) = parse_two_args(inner, "alphanumeric", span)?;
		let min: usize = a.parse().map_err(|_| {
			syn::Error::new(span, format!("invalid alphanumeric min length: '{}'", a))
		})?;
		let max: usize = b.parse().map_err(|_| {
			syn::Error::new(span, format!("invalid alphanumeric max length: '{}'", b))
		})?;
		return Ok(FuzzStrategy::AlphanumericStr(min, max));
	}

	if let Some(inner) = trimmed.strip_prefix("range(").and_then(|s| s.strip_suffix(')')) {
		let (a, b) = parse_two_args(inner, "range", span)?;
		return Ok(FuzzStrategy::Range(a, b));
	}

	Err(syn::Error::new(
		span,
		format!("unknown fuzz strategy: '{}'", trimmed),
	))
}

fn validate_fuzz_strategy(
	strategy: &FuzzStrategy,
	type_kind: &FuzzTypeKind,
	field_name: &syn::Ident,
	span: proc_macro2::Span,
) -> Result<(), syn::Error> {
	match strategy {
		FuzzStrategy::Ascii(_, _) | FuzzStrategy::AlphanumericStr(_, _) => {
			if !matches!(type_kind, FuzzTypeKind::String) {
				return Err(syn::Error::new(
					span,
					format!(
						"fuzz strategy is only valid for String fields, but field '{}' is not a String",
						field_name
					),
				));
			}
		}
		FuzzStrategy::Range(_, _) => {
			if !matches!(type_kind, FuzzTypeKind::Integer | FuzzTypeKind::Float) {
				return Err(syn::Error::new(
					span,
					format!(
						"fuzz strategy 'range' is only valid for numeric fields, but field '{}' is not numeric",
						field_name
					),
				));
			}
		}
	}
	Ok(())
}

fn generate_fuzz_default_expr(
	strategy: Option<&FuzzStrategy>,
	type_kind: &FuzzTypeKind,
	field_name: &syn::Ident,
	span: proc_macro2::Span,
) -> Result<proc_macro2::TokenStream, syn::Error> {
	match (type_kind, strategy) {
		(FuzzTypeKind::String, Some(FuzzStrategy::Ascii(min, max))) => {
			let len = (min + max) / 2;
			let s = "a".repeat(len);
			Ok(quote! { String::from(#s) })
		}
		(FuzzTypeKind::String, Some(FuzzStrategy::AlphanumericStr(min, max))) => {
			let len = (min + max) / 2;
			let s = "a".repeat(len);
			Ok(quote! { String::from(#s) })
		}
		(FuzzTypeKind::String, None) => Ok(quote! { String::from("aaaa") }),
		(FuzzTypeKind::Bool, None) => Ok(quote! { false }),
		(FuzzTypeKind::Integer, Some(FuzzStrategy::Range(min, max))) => {
			let min_lit: proc_macro2::TokenStream = min.parse().unwrap();
			let max_lit: proc_macro2::TokenStream = max.parse().unwrap();
			Ok(quote! { (#min_lit + #max_lit) / 2 })
		}
		(FuzzTypeKind::Integer, None) => Ok(quote! { 0 }),
		(FuzzTypeKind::Float, Some(FuzzStrategy::Range(min, max))) => {
			let min_lit: proc_macro2::TokenStream = min.parse().unwrap();
			let max_lit: proc_macro2::TokenStream = max.parse().unwrap();
			Ok(quote! { (#min_lit + #max_lit) / 2.0 })
		}
		(FuzzTypeKind::Float, None) => Ok(quote! { 0.0 }),
		(FuzzTypeKind::Other(type_name), _) => Err(syn::Error::new(
			span,
			format!(
				"Fuzz: unsupported type '{}' for field '{}', use a supported type (String, bool, numeric) or annotate with #[holy(fuzz = \"...\")]",
				type_name, field_name
			),
		)),
		_ => Err(syn::Error::new(
			span,
			format!("invalid fuzz strategy for field '{}'", field_name),
		)),
	}
}

fn generate_fuzz_rng_expr(
	strategy: Option<&FuzzStrategy>,
	type_kind: &FuzzTypeKind,
	field_name: &syn::Ident,
	span: proc_macro2::Span,
) -> Result<proc_macro2::TokenStream, syn::Error> {
	match (type_kind, strategy) {
		(FuzzTypeKind::String, Some(FuzzStrategy::Ascii(min, max))) => Ok(quote! {
			{
				let len = rand::Rng::gen_range(rng, #min..=#max);
				(0..len).map(|_| rand::Rng::gen_range(rng, b' '..=b'~') as char).collect::<String>()
			}
		}),
		(FuzzTypeKind::String, Some(FuzzStrategy::AlphanumericStr(min, max))) => Ok(quote! {
			{
				let len = rand::Rng::gen_range(rng, #min..=#max);
				let chars: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
				(0..len).map(|_| chars[rand::Rng::gen_range(rng, 0..chars.len())] as char).collect::<String>()
			}
		}),
		(FuzzTypeKind::String, None) => Ok(quote! {
			{
				let len = rand::Rng::gen_range(rng, 0usize..=64usize);
				(0..len).map(|_| rand::Rng::gen_range(rng, b' '..=b'~') as char).collect::<String>()
			}
		}),
		(FuzzTypeKind::Bool, None) => Ok(quote! { rand::Rng::gen_bool(rng, 0.5) }),
		(FuzzTypeKind::Integer, Some(FuzzStrategy::Range(min, max))) => {
			let min_lit: proc_macro2::TokenStream = min.parse().unwrap();
			let max_lit: proc_macro2::TokenStream = max.parse().unwrap();
			Ok(quote! { rand::Rng::gen_range(rng, #min_lit..=#max_lit) })
		}
		(FuzzTypeKind::Integer, None) => {
			let gen_ident = syn::Ident::new_raw("gen", proc_macro2::Span::call_site());
			Ok(quote! { rand::Rng::#gen_ident(rng) })
		}
		(FuzzTypeKind::Float, Some(FuzzStrategy::Range(min, max))) => {
			let min_lit: proc_macro2::TokenStream = min.parse().unwrap();
			let max_lit: proc_macro2::TokenStream = max.parse().unwrap();
			Ok(quote! { rand::Rng::gen_range(rng, #min_lit..=#max_lit) })
		}
		(FuzzTypeKind::Float, None) => Ok(quote! {
			rand::Rng::gen_range(rng, -1_000_000.0f64..1_000_000.0f64)
		}),
		(FuzzTypeKind::Other(type_name), _) => Err(syn::Error::new(
			span,
			format!(
				"Fuzz: unsupported type '{}' for field '{}'",
				type_name, field_name
			),
		)),
		_ => Err(syn::Error::new(
			span,
			format!("invalid fuzz strategy for field '{}'", field_name),
		)),
	}
}

pub fn impl_fuzz_macro(ast: &DeriveInput) -> Result<TokenStream, syn::Error> {
	let struct_name = &ast.ident;
	let (impl_generics, ty_generics, where_clause) = ast.generics.split_for_impl();

	let fields = match &ast.data {
		Data::Struct(data) => match &data.fields {
			Fields::Named(named) => &named.named,
			_ => {
				return Err(syn::Error::new_spanned(
					ast,
					"Fuzz macro only supports structs with named fields",
				));
			}
		},
		_ => {
			return Err(syn::Error::new_spanned(
				ast,
				"Fuzz macro only supports structs",
			));
		}
	};

	let mut default_field_inits = Vec::new();
	let mut rng_field_inits = Vec::new();

	for field in fields.iter() {
		let field_name = field.ident.as_ref().unwrap();
		let type_kind = classify_fuzz_type(&field.ty);

		let strategy = match get_holy_string_value(&field.attrs, "fuzz") {
			Some((raw, span)) => Some(parse_fuzz_strategy(&raw, span)?),
			None => None,
		};

		if let Some(ref strat) = strategy {
			validate_fuzz_strategy(strat, &type_kind, field_name, field_name.span())?;
		}

		let default_expr =
			generate_fuzz_default_expr(strategy.as_ref(), &type_kind, field_name, field_name.span())?;
		let rng_expr =
			generate_fuzz_rng_expr(strategy.as_ref(), &type_kind, field_name, field_name.span())?;

		default_field_inits.push(quote! { #field_name: #default_expr });
		rng_field_inits.push(quote! { #field_name: #rng_expr });
	}

	let expanded = quote! {
		impl #impl_generics #struct_name #ty_generics #where_clause {
			pub fn fuzz_default() -> Self {
				Self {
					#(#default_field_inits,)*
				}
			}

			pub fn fuzz_with(rng: &mut impl rand::Rng) -> Self {
				Self {
					#(#rng_field_inits,)*
				}
			}
		}
	};

	Ok(TokenStream::from(expanded))
}
