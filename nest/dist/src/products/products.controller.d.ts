import { GetProductsQuery } from './dto/get-products.query';
import { ProductsService } from './products.service';
export declare class ProductsController {
    private readonly productsService;
    constructor(productsService: ProductsService);
    getProducts(query: GetProductsQuery): Promise<{
        id: number;
        name: string;
        description: string;
        price: number;
        imageExists: boolean;
    }[]>;
    getProductById(id: number): Promise<{
        id: number;
        name: string;
        description: string;
        price: number;
        imageExists: boolean;
    }>;
}
