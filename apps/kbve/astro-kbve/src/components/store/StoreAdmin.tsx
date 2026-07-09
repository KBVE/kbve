import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@kbve/astro';
import {
	catalog,
	productDetail,
	staffUpsertProduct,
	staffUpsertVariant,
	staffSetProductStatus,
	staffSetVariantStatus,
	StoreApiError,
	type StoreProduct,
	type StoreVariant,
	type Fulfillment,
} from './api';
import './store.css';

const FULFILLMENTS: Fulfillment[] = ['digital', 'physical', 'both'];

export function StoreAdmin() {
	const { ready, authenticated } = useSession();
	const [products, setProducts] = useState<StoreProduct[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	// product form
	const [slug, setSlug] = useState('');
	const [title, setTitle] = useState('');
	const [price, setPrice] = useState(10);
	const [fulfillment, setFulfillment] = useState<Fulfillment>('digital');
	const [description, setDescription] = useState('');

	// variant form
	const [variantProduct, setVariantProduct] = useState('');
	const [sku, setSku] = useState('');
	const [variantPrice, setVariantPrice] = useState(10);
	const [stock, setStock] = useState('');
	const [attrs, setAttrs] = useState('{"size":"L"}');
	const [variants, setVariants] = useState<StoreVariant[]>([]);

	const refresh = useCallback(async () => {
		try {
			setProducts(await catalog());
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'load failed');
		}
	}, []);

	useEffect(() => {
		if (ready && authenticated) void refresh();
	}, [ready, authenticated, refresh]);

	const loadVariants = useCallback(async (productSlug: string) => {
		if (!productSlug) return setVariants([]);
		try {
			const d = await productDetail(productSlug);
			setVariants(d.variants);
		} catch {
			setVariants([]);
		}
	}, []);

	const submitProduct = useCallback(async () => {
		setBusy(true);
		setError(null);
		try {
			await staffUpsertProduct({
				slug,
				title,
				description: description || null,
				price,
				fulfillment,
			});
			await refresh();
		} catch (e) {
			setError(fmtErr(e));
		} finally {
			setBusy(false);
		}
	}, [slug, title, description, price, fulfillment, refresh]);

	const submitVariant = useCallback(async () => {
		setBusy(true);
		setError(null);
		try {
			let attributes: Record<string, unknown> = {};
			try {
				attributes = JSON.parse(attrs || '{}');
			} catch {
				throw new Error('attributes must be valid JSON');
			}
			await staffUpsertVariant(variantProduct, {
				sku,
				attributes,
				price: variantPrice,
				stock: stock === '' ? null : Number(stock),
			});
			const p = products.find((x) => x.product_id === variantProduct);
			if (p) await loadVariants(p.slug);
		} catch (e) {
			setError(fmtErr(e));
		} finally {
			setBusy(false);
		}
	}, [variantProduct, sku, variantPrice, stock, attrs, products, loadVariants]);

	const toggleProduct = useCallback(
		async (p: StoreProduct) => {
			try {
				await staffSetProductStatus(p.product_id, 'retired');
				await refresh();
			} catch (e) {
				setError(fmtErr(e));
			}
		},
		[refresh],
	);

	if (!ready) return <div className="kbve-store-card--skeleton" />;
	if (!authenticated)
		return <p className="kbve-store-card__error">Sign in as staff.</p>;

	return (
		<div className="kbve-store-admin">
			{error && <p className="kbve-store-card__error">{error}</p>}

			<section className="kbve-store-admin__panel">
				<h3>Products</h3>
				<ul className="kbve-store-admin__list">
					{products.map((p) => (
						<li key={p.product_id}>
							<span>
								<strong>{p.title}</strong> · {p.slug} ·{' '}
								{p.price} {p.currency} · {p.fulfillment} ·{' '}
								{p.variant_count} variant(s)
							</span>
							<button
								type="button"
								onClick={() => void toggleProduct(p)}>
								Retire
							</button>
						</li>
					))}
				</ul>
			</section>

			<section className="kbve-store-admin__panel">
				<h3>Upsert product</h3>
				<div className="kbve-store-admin__form">
					<input
						placeholder="slug"
						value={slug}
						onChange={(e) => setSlug(e.target.value)}
					/>
					<input
						placeholder="title"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
					/>
					<input
						type="number"
						placeholder="price (credits)"
						value={price}
						onChange={(e) => setPrice(Number(e.target.value))}
					/>
					<select
						value={fulfillment}
						onChange={(e) =>
							setFulfillment(e.target.value as Fulfillment)
						}>
						{FULFILLMENTS.map((f) => (
							<option key={f} value={f}>
								{f}
							</option>
						))}
					</select>
					<input
						placeholder="description"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
					<button
						type="button"
						disabled={busy || !slug || !title}
						onClick={() => void submitProduct()}>
						Save product
					</button>
				</div>
			</section>

			<section className="kbve-store-admin__panel">
				<h3>Upsert variant</h3>
				<div className="kbve-store-admin__form">
					<select
						value={variantProduct}
						onChange={(e) => {
							setVariantProduct(e.target.value);
							const p = products.find(
								(x) => x.product_id === e.target.value,
							);
							if (p) void loadVariants(p.slug);
						}}>
						<option value="">— product —</option>
						{products.map((p) => (
							<option key={p.product_id} value={p.product_id}>
								{p.title}
							</option>
						))}
					</select>
					<input
						placeholder="sku"
						value={sku}
						onChange={(e) => setSku(e.target.value)}
					/>
					<input
						type="number"
						placeholder="price (credits)"
						value={variantPrice}
						onChange={(e) =>
							setVariantPrice(Number(e.target.value))
						}
					/>
					<input
						placeholder="stock (blank = unlimited)"
						value={stock}
						onChange={(e) => setStock(e.target.value)}
					/>
					<input
						placeholder='attributes JSON e.g. {"size":"L"}'
						value={attrs}
						onChange={(e) => setAttrs(e.target.value)}
					/>
					<button
						type="button"
						disabled={busy || !variantProduct || !sku}
						onClick={() => void submitVariant()}>
						Save variant
					</button>
				</div>
				{variants.length > 0 && (
					<ul className="kbve-store-admin__list">
						{variants.map((v) => (
							<li key={v.variant_id}>
								<span>
									{v.sku} · {v.price} · stock{' '}
									{v.stock ?? '∞'}
								</span>
								<button
									type="button"
									onClick={() =>
										void staffSetVariantStatus(
											v.variant_id,
											'retired',
										).then(() => {
											const p = products.find(
												(x) =>
													x.product_id ===
													variantProduct,
											);
											if (p) void loadVariants(p.slug);
										})
									}>
									Retire
								</button>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}

function fmtErr(e: unknown): string {
	if (e instanceof StoreApiError) {
		if (e.status === 403) return 'Staff permissions required.';
		if (e.status === 401) return 'Sign in as staff.';
		return e.message || 'request failed';
	}
	return e instanceof Error ? e.message : 'request failed';
}

export default StoreAdmin;
