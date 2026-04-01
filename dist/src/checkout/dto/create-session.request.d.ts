declare const colors: readonly ["black", "white"];
declare const sizes: readonly ["XS", "S", "M", "L", "XL"];
export declare class CreateSessionItemRequest {
    productId: number;
    color: (typeof colors)[number];
    size: (typeof sizes)[number];
    quantity: number;
}
export declare class DeliveryAddressRequest {
    fullName: string;
    phone?: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
}
export declare class CreateSessionRequest {
    items: CreateSessionItemRequest[];
    deliveryAddress: DeliveryAddressRequest;
}
export {};
