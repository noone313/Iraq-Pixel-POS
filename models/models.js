import { Sequelize, DataTypes, Op } from "sequelize";
import dotenv from "dotenv";
dotenv.config();


// 1. إعداد الاتصال بقاعدة البيانات مع تحسين أداء الـ Connection Pool
const sequelize = new Sequelize(process.env.DB_CONNECTION_STRING, {
    logging: false, // تعطيل تسجيل الاستعلامات في الكونسول لزيادة الأداء
    timezone: '+03:00',
    pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000
    }
});

// ======================== الموديلات (Models) مع الفهارس ========================

// الفئات (Categories)
const Category = sequelize.define("Category", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false, unique: true }
}, { 
    tableName: "Categories",
    indexes: [{ fields: ['name'] }]
});

// المستخدمين (Users)
const User = sequelize.define("User", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    username: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    password: { type: DataTypes.STRING(255), allowNull: false },
    fullName: { type: DataTypes.STRING(100), allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    role: { type: DataTypes.ENUM('ADMIN', 'CASHIER', 'SUPER_ADMIN'), defaultValue: 'CASHIER' }
}, { 
    tableName: "Users", 
    paranoid: true,
    indexes: [{ fields: ['username'] }, { fields: ['role'] }]
});

// المنتجات (Products)
const Product = sequelize.define("Product", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    barcode: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    unitType: { type: DataTypes.ENUM('PCS', 'KG', 'BOX'), defaultValue: 'PCS' },
    purchasePrice: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    salePrice: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    currentStock: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    minStockLevel: { type: DataTypes.DECIMAL(12, 2), defaultValue: 10 }
}, { 
    tableName: "Products", 
    paranoid: true,
    indexes: [
        { fields: ['barcode'] },
        { fields: ['name'] },
        { fields: ['categoryId'] }
    ]
});

// حركات المخزون (Stock Movements)
const StockMovement = sequelize.define("StockMovement", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    type: { type: DataTypes.ENUM('IN', 'OUT', 'ADJUST'), allowNull: false },
    quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    referenceId: { type: DataTypes.INTEGER }, 
    referenceType: { type: DataTypes.STRING(50) },
    previousQuantity: { type: DataTypes.DECIMAL(12, 2) },
    newQuantity: { type: DataTypes.DECIMAL(12, 2) }
}, { 
    tableName: "StockMovements",
    indexes: [
        { fields: ['referenceId', 'referenceType'] },
        { fields: ['productId'] },
        { fields: ['createdAt'] }
    ]
});

// المبيعات (Sales)
const Sale = sequelize.define("Sale", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    invoiceNumber: { type: DataTypes.STRING(50), unique: true },
    type: { type: DataTypes.ENUM('CASH', 'DEBT'), defaultValue: 'CASH' },
    total: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    paid: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    change: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 }
}, { 
    tableName: "Sales", 
    paranoid: true,
    indexes: [                                
        { fields: ['invoiceNumber'] },
        { fields: ['createdAt'] },
        { fields: ['customerId'] }
    ]
});

// مواد الفاتورة (SaleItems)
const SaleItem = sequelize.define("SaleItem", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    priceAtSale: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    costAtSale: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    total: { type: DataTypes.DECIMAL(12, 2), allowNull: false }
}, { 
    tableName: "SaleItems",
    indexes: [{ fields: ['saleId'] }, { fields: ['productId'] }]
});

// المشتريات (Purchases)
const Purchase = sequelize.define("Purchase", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    invoiceNumber: { type: DataTypes.STRING(50), unique: true },
    total: { type: DataTypes.DECIMAL(12, 2), allowNull: false }
}, { 
    tableName: "Purchases",
    indexes: [{ fields: ['invoiceNumber'] }, { fields: ['createdAt'] }]
});

// مواد الشراء (PurchaseItems)
const PurchaseItem = sequelize.define("PurchaseItem", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    total: { type: DataTypes.DECIMAL(12, 2), allowNull: false }
}, { 
    tableName: "PurchaseItems",
    indexes: [{ fields: ['purchaseId'] }, { fields: ['productId'] }]
});

// العملاء (Customers)
const Customer = sequelize.define("Customer", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    currentDebt: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 }
}, { 
    tableName: "Customers",
    indexes: [{ fields: ['name'] }]
});

// الموردين (Suppliers)
const Supplier = sequelize.define("Supplier", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    currentDebt: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 }
}, { 
    tableName: "Suppliers",
    indexes: [{ fields: ['name'] }]
});

// الديون (Debts)
const Debt = sequelize.define("Debt", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    type: { type: DataTypes.ENUM('CUSTOMER', 'SUPPLIER'), allowNull: false },
    originalAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    remainingAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    status: { type: DataTypes.ENUM('PENDING', 'PARTIAL', 'PAID'), defaultValue: 'PENDING' },
    referenceId: { type: DataTypes.INTEGER }, 
    referenceType: { type: DataTypes.STRING(50) }
}, { 
    tableName: "Debts", 
    paranoid: true,
    indexes: [
        { fields: ['status'] }, 
        { fields: ['customerId'] }, 
        { fields: ['supplierId'] },
        { fields: ['referenceId', 'referenceType'] }
    ]
});

// النقدية (Cash Movements)
const CashMovement = sequelize.define("CashMovement", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    type: { type: DataTypes.ENUM('IN', 'OUT'), allowNull: false },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    category: { type: DataTypes.ENUM('SALE', 'PURCHASE', 'DEBT_PAYMENT', 'EXPENSE', 'OTHER'), allowNull: false },
    referenceId: { type: DataTypes.INTEGER },
    referenceType: { type: DataTypes.STRING(50) }
}, { 
    tableName: "CashMovements",
    indexes: [
        { fields: ['category'] }, 
        { fields: ['createdAt'] }, 
        { fields: ['userId'] },
        { fields: ['referenceId', 'referenceType'] }
    ]
});

// ======================== العلاقات (Relationships) ========================

// التصنيفات والمنتجات
Category.hasMany(Product, { foreignKey: "categoryId" });
Product.belongsTo(Category, { foreignKey: "categoryId" });

// المستخدمين والمبيعات وحركات النقدية
User.hasMany(Sale, { foreignKey: "userId" });
Sale.belongsTo(User, { foreignKey: "userId" });

User.hasMany(CashMovement, { foreignKey: "userId" });
CashMovement.belongsTo(User, { foreignKey: "userId" });

// العملاء والمبيعات والديون
Customer.hasMany(Sale, { foreignKey: "customerId" });
Sale.belongsTo(Customer, { foreignKey: "customerId" });

Customer.hasMany(Debt, { foreignKey: "customerId" });
Debt.belongsTo(Customer, { foreignKey: "customerId" });

// الموردين والمشتريات والديون
Supplier.hasMany(Purchase, { foreignKey: "supplierId" });
Purchase.belongsTo(Supplier, { foreignKey: "supplierId" });

Supplier.hasMany(Debt, { foreignKey: "supplierId" });
Debt.belongsTo(Supplier, { foreignKey: "supplierId" });

// المبيعات وموادها
Sale.hasMany(SaleItem, { foreignKey: "saleId", onDelete: "CASCADE" });
SaleItem.belongsTo(Sale, { foreignKey: "saleId" });

// المشتريات وموادها
Purchase.hasMany(PurchaseItem, { foreignKey: "purchaseId", onDelete: "CASCADE" });
PurchaseItem.belongsTo(Purchase, { foreignKey: "purchaseId" });

// المنتجات مع مواد المبيعات والمشتريات وحركات المخزون
Product.hasMany(SaleItem, { foreignKey: "productId" });
SaleItem.belongsTo(Product, { foreignKey: "productId" });

Product.hasMany(PurchaseItem, { foreignKey: "productId" });
PurchaseItem.belongsTo(Product, { foreignKey: "productId" });

Product.hasMany(StockMovement, { foreignKey: "productId" });
StockMovement.belongsTo(Product, { foreignKey: "productId" });

// ======================== العلاقات Polymorphic للديون ========================
// ربط Debt مع Sale (للمبيعات الآجلة)
Sale.hasMany(Debt, { 
    foreignKey: "referenceId", 
    constraints: false, 
    scope: { referenceType: 'Sale' }
});
Debt.belongsTo(Sale, { 
    foreignKey: "referenceId", 
    constraints: false, 
    as: 'sale' 
});

// ربط Debt مع Purchase (للمشتريات الآجلة)
Purchase.hasMany(Debt, { 
    foreignKey: "referenceId", 
    constraints: false, 
    scope: { referenceType: 'Purchase' }
});
Debt.belongsTo(Purchase, { 
    foreignKey: "referenceId", 
    constraints: false, 
    as: 'purchase' 
});

// ======================== العلاقات Polymorphic للنقدية ========================
// ربط CashMovement مع Sale
Sale.hasMany(CashMovement, { 
    foreignKey: "referenceId", 
    constraints: false, 
    scope: { referenceType: 'Sale' }
});
CashMovement.belongsTo(Sale, { 
    foreignKey: "referenceId", 
    constraints: false, 
    as: 'sale' 
});

// ربط CashMovement مع Purchase
Purchase.hasMany(CashMovement, { 
    foreignKey: "referenceId", 
    constraints: false, 
    scope: { referenceType: 'Purchase' }
});
CashMovement.belongsTo(Purchase, { 
    foreignKey: "referenceId", 
    constraints: false, 
    as: 'purchase' 
});

// ربط CashMovement مع Debt
Debt.hasMany(CashMovement, { 
    foreignKey: "referenceId", 
    constraints: false, 
    scope: { referenceType: 'Debt' }
});
CashMovement.belongsTo(Debt, { 
    foreignKey: "referenceId", 
    constraints: false, 
    as: 'debt' 
});

// ======================== التشغيل (Initialization) ========================

const startServer = async () => {
    try {
        // اختبار الاتصال
        await sequelize.authenticate();
        console.log("✅ Connection established successfully.");

        // مزامنة الجداول مع قاعدة البيانات
        await sequelize.sync({ alter: true });
        console.log("✅ All Models Synced Successfully.");

    } catch (e) {
        console.error("❌ Unable to connect to the database:", e);
        process.exit(1);
    }
};

// ======================== تصدير الموديلات ========================

export { 
    sequelize, 
    startServer, 
    User, 
    Product, 
    Category, 
    Sale, 
    SaleItem, 
    Customer, 
    Supplier, 
    Purchase, 
    PurchaseItem,
    Debt, 
    CashMovement, 
    StockMovement,
    Op
};