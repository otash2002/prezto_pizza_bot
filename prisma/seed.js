"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const menuData = [
        {
            name: 'PIZZA',
            products: [
                { name: 'Pepperoni', price: 70000 },
                { name: 'Pollo', price: 75000 },
                { name: 'Vetchina', price: 75000 },
                { name: 'Carnoso', price: 85000 },
                { name: '4 type', price: 90000 },
                { name: 'Presto Pizza', price: 100000 },
            ],
        },
        {
            name: 'HOT-DOG',
            products: [
                { name: 'Oddiy', price: 10000 },
                { name: 'Canada', price: 13000 },
                { name: 'Canada 2x', price: 15000 },
                { name: 'Chicken Hot-Dog', price: 18000 },
                { name: 'Go\'shtli Hot-Dog', price: 20000 },
                { name: 'Qazili Hot-Dog', price: 25000 },
            ],
        },
        {
            name: 'LAVASH',
            products: [
                { name: 'Lavash', price: 25000 },
                { name: 'Lavash Sirli', price: 28000 },
                { name: 'Tandir Lavash', price: 30000 },
                { name: 'Tandir Lavash Sirli', price: 35000 },
            ],
        },
        {
            name: 'BURGER',
            products: [
                { name: 'Burger Oddiy', price: 15000 },
                { name: 'Chizburger', price: 17000 },
                { name: 'Chicken Burger', price: 20000 },
                { name: 'BBQ Burger', price: 25000 },
            ],
        },
        {
            name: 'DONER',
            products: [
                { name: 'Doner', price: 25000 },
                { name: 'Non Kabob', price: 35000 },
                { name: 'KFC 1 pors', price: 25000 },
                { name: 'Free', price: 15000 },
            ],
        },
        {
            name: 'SANDWICH',
            products: [
                { name: 'Sandwich Indeyka', price: 30000 },
                { name: 'Sandwich Carnoso', price: 35000 },
                { name: 'Sandwich Pollo', price: 30000 },
            ],
        },
    ];
    for (const item of menuData) {
        await prisma.category.create({
            data: {
                name: item.name,
                products: { create: item.products },
            },
        });
    }
    console.log('✅ Baza menular bilan to\'ldirildi!');
}
main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
//# sourceMappingURL=seed.js.map