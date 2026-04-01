import { PrismaService } from '../prisma/prisma.service';
import { GetProductsQuery } from './dto/get-products.query';
export declare class ProductsService {
    private readonly prismaService;
    constructor(prismaService: PrismaService);
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
    private toProductResponse;
}
