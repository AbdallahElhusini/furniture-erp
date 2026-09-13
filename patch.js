
const fs = require("fs");
let c = fs.readFileSync("src/app/(storefront)/product/[id]/page.tsx", "utf8");

const oldCode = `            {/* Actions */}
            <ProductDetailActions 
              catalogItemId={product.id}
              name={product.nameAr}
              details={{
                nameEn: product.nameEn,
                sku: product.sku,
                category: product.category?.nameAr,
                dimensions: product.dimensions || undefined,
                material: product.material || undefined,
                color: product.color || undefined,
                image: productImages[0],
              }}
            />
          </div>
        </div>`;

const newCode = `            {/* Actions */}
            <ProductDetailActions 
              catalogItemId={product.id}
              name={product.nameAr}
              details={{
                nameEn: product.nameEn,
                sku: product.sku,
                category: product.category?.nameAr,
                dimensions: product.dimensions || undefined,
                material: product.material || undefined,
                color: product.color || undefined,
                image: productImages[0],
              }}
            />
          </div>
        </div>

        {/* Extended Specifications Table */}
        {product.specifications && (() => {
          try {
            const specs = JSON.parse(product.specifications);
            if (Object.keys(specs).length > 0) {
              return (
                <div className="mb-20">
                  <h3 className="text-xl font-bold text-primary mb-6">????????? ??????</h3>
                  <div className="bg-white border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-sm text-right">
                      <tbody>
                        {Object.entries(specs).map(([key, value], i) => (
                          <tr key={key} className={i % 2 === 0 ? "bg-slate-50" : "bg-white"}>
                            <td className="py-4 px-6 font-medium text-slate-600 border-b border-border w-1/3">{key}</td>
                            <td className="py-4 px-6 text-slate-500 border-b border-border">{String(value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            }
          } catch(e) {}
          return null;
        })()}
`;

c = c.replace(oldCode, newCode);
fs.writeFileSync("src/app/(storefront)/product/[id]/page.tsx", c);

