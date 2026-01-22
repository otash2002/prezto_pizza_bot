import { Injectable, OnModuleInit } from '@nestjs/common';
import { Bot, InlineKeyboard, Keyboard, session } from 'grammy';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class BotService implements OnModuleInit {
  private readonly prisma = new PrismaClient();
  private readonly bot = new Bot(process.env.BOT_TOKEN!);
  private readonly ADMIN_ID = process.env.ADMIN_ID!;

  async onModuleInit() {
    // 1. SESSION INITIALIZATION
    this.bot.use(session({ 
      initial: () => ({ 
        cart: [] as any[], 
        phone: '', 
        orderType: '', 
        location: null as any,
        lastAction: 'menu' 
      }) 
    }));

    const WEB_APP_URL = "https://otash2002.github.io/prezto_pizza_bot/?v=10";

    const mainMenu = new Keyboard()
      .webApp("🍴 Menyu", WEB_APP_URL)
      .text("🛒 Savat")
      .row()
      .text("🔄 Qayta boshlash")
      .text("📞 Aloqa")
      .resized()
      .persistent();

    // ========================================
    // START COMMAND (0 dan boshlash logikasi)
    // ========================================
    const startAction = async (ctx: any) => {
      // Sessionni tozalaymiz
      ctx.session.cart = [];
      ctx.session.phone = '';
      ctx.session.orderType = '';
      ctx.session.location = null;
      ctx.session.lastAction = 'registration';

      // Bazadagi foydalanuvchini topamiz va telefonini o'chirib tashlaymiz (Noldan so'rashi uchun)
      await this.prisma.user.updateMany({
        where: { telegramId: ctx.from.id.toString() },
        data: { phone: '' } // Telefonni bo'shatib qo'yamiz
      });

      await ctx.reply(
        `🍕 **Presto Pizza** ga xush kelibsiz!\n\nXizmat ko'rsatishimiz uchun raqamingizni yuboring:`, 
        {
          reply_markup: new Keyboard()
            .requestContact("📞 Raqamni yuborish")
            .resized()
            .oneTime()
        }
      );
    };

    this.bot.command('start', startAction);

    // ========================================
    // GLOBAL CALLBACK HANDLER (BACK)
    // ========================================
    this.bot.on('callback_query:data', async (ctx, next) => {
      if (ctx.callbackQuery.data === 'back') {
        await this.handleBackButton(ctx);
        return;
      }
      return next();
    });

    // ========================================
    // REGISTRATION (CONTACT)
    // ========================================
    this.bot.on('message:contact', async (ctx: any) => {
      const phone = ctx.message.contact.phone_number;
      ctx.session.phone = phone;
      
      await this.prisma.user.upsert({
        where: { telegramId: ctx.from.id.toString() },
        update: { phone: phone },
        create: { 
          telegramId: ctx.from.id.toString(), 
          phone: phone, 
          name: ctx.from.first_name 
        }
      });
      
      const typeKeyboard = new InlineKeyboard()
        .text("🚖 Yetkazib berish", "type_delivery")
        .text("🛍 Olib ketish", "type_pickup");
      
      await ctx.reply("✅ Ro'yxatdan o'tdingiz!\n\nXizmat turini tanlang:", { reply_markup: typeKeyboard });
    });

    // ========================================
    // ORDER TYPE & LOCATION
    // ========================================
    this.bot.callbackQuery('type_delivery', async (ctx: any) => {
      ctx.session.orderType = 'Yetkazib berish';
      ctx.session.lastAction = 'selecting_delivery';
      await ctx.answerCallbackQuery();
      await ctx.editMessageText("📍 **Yetkazib berish tanlandi**");
      await ctx.reply("Manzilni yuborish uchun pastdagi tugmani bosing 👇", {
        reply_markup: new Keyboard().requestLocation("📍 Lokatsiyani yuborish").resized().oneTime()
      });
    });

    this.bot.callbackQuery('type_pickup', async (ctx: any) => {
      ctx.session.orderType = 'Olib ketish';
      ctx.session.location = null;
      ctx.session.lastAction = 'menu';
      await ctx.answerCallbackQuery();
      await ctx.editMessageText("🛍 **Olib ketish tanlandi**");
      await ctx.reply("✅ Manzil: Chartak sh., Alisher Navoiy ko'chasi.\n\nMenudan buyurtma bering 👇", { reply_markup: mainMenu });
    });

    this.bot.on('message:location', async (ctx: any) => {
      ctx.session.location = ctx.message.location;
      ctx.session.lastAction = 'menu';
      await ctx.reply("✅ Manzil qabul qilindi!\n\nMenudan buyurtma bering 👇", { reply_markup: mainMenu });
    });

    // ========================================
    // MINI APP ORDER (ADMIN NOTIFICATION)
    // ========================================
    this.bot.on('message:web_app_data', async (ctx: any) => {
      try {
        const orderItems = JSON.parse(ctx.message.web_app_data.data);
        if (!orderItems || orderItems.length === 0) return ctx.reply("❌ Buyurtma bo'sh!");

        if (!ctx.session.phone) return ctx.reply("❌ Avval raqam yuboring! /start");

        let orderSummary = "🚀 **Mini App-dan yangi buyurtma!**\n\n";
        orderSummary += `👤 **Mijoz:** ${ctx.from.first_name}\n`;
        orderSummary += `📞 **Telefon:** ${ctx.session.phone}\n`;
        orderSummary += `🚚 **Turi:** ${ctx.session.orderType || 'Tanlanmagan'}\n\n`;
        
        let totalPrice = 0;
        orderItems.forEach((item: any, index: number) => {
          const itemTotal = item.price * item.quantity;
          totalPrice += itemTotal;
          orderSummary += `${index + 1}. ${item.name} | ${item.quantity} ta = ${itemTotal.toLocaleString()} so'm\n`;
        });
        orderSummary += `\n💰 **JAMI: ${totalPrice.toLocaleString()} so'm**`;

        const adminKeyboard = new InlineKeyboard()
          .text("✅ Qabul qilish", `accept_${ctx.from.id}_${totalPrice}`)
          .text("❌ Rad etish", `reject_${ctx.from.id}`)
          .row()
          .text("📞 Aloqa", `contact_${ctx.from.id}`);

        await this.bot.api.sendMessage(this.ADMIN_ID, orderSummary, { 
          parse_mode: 'Markdown', 
          reply_markup: adminKeyboard 
        });

        if (ctx.session.location) {
          await this.bot.api.sendLocation(this.ADMIN_ID, ctx.session.location.latitude, ctx.session.location.longitude);
        }

        await ctx.reply(`✅ **Buyurtmangiz yuborildi!**\n💰 Jami: ${totalPrice.toLocaleString()} so'm`, { reply_markup: mainMenu });
      } catch (e) { await ctx.reply("❌ Xatolik yuz berdi."); }
    });

    // ========================================
    // ADMIN ACTIONS
    // ========================================
    this.bot.callbackQuery(/^accept_(\d+)_(\d+)$/, async (ctx: any) => {
      const userId = ctx.match[1];
      const price = ctx.match[2];
      await ctx.answerCallbackQuery("✅ Tasdiqlandi");
      await this.bot.api.sendMessage(userId, `✅ **Sizning buyurtmangiz qabul qilindi!**\n💰 Summa: ${parseInt(price).toLocaleString()} so'm\n⏰ Tez orada yetkazamiz.`);
      await ctx.editMessageText(ctx.callbackQuery.message.text + "\n\n✅ **STATUS: QABUL QILINDI**");
    });

    this.bot.callbackQuery(/^reject_(\d+)$/, async (ctx: any) => {
      await this.bot.api.sendMessage(ctx.match[1], "❌ **Kechirasiz, buyurtmangiz rad etildi.**");
      await ctx.editMessageText(ctx.callbackQuery.message.text + "\n\n❌ **STATUS: RAD ETILDI**");
    });

    this.bot.callbackQuery(/^contact_(\d+)$/, async (ctx: any) => {
      const user = await this.prisma.user.findUnique({ where: { telegramId: ctx.match[1] } });
      await ctx.reply(`📞 Mijoz: ${user?.phone || 'Noma`lum'}`);
    });

    // ========================================
    // TEXT COMMANDS
    // ========================================
    this.bot.on('message:text', async (ctx: any) => {
      const text = ctx.message.text;
      if (text === "🛒 Savat") {
        ctx.session.lastAction = 'cart';
        await this.showCart(ctx);
      } else if (text === "🔄 Qayta boshlash") {
        await startAction(ctx);
      } else if (text === "📞 Aloqa") {
        await ctx.reply("☎️ +998 94 677 75 90\n📍 Chartak sh., Alisher Navoiy ko'chasi");
      }
    });

    // Inline menu (eski tizim uchun)
    this.bot.callbackQuery(/^cat_(\d+)$/, async (ctx: any) => {
      const catId = parseInt(ctx.match[1]);
      ctx.session.lastAction = `category_${catId}`;
      const products = await this.prisma.product.findMany({ where: { categoryId: catId } });
      const keyboard = new InlineKeyboard();
      products.forEach(p => keyboard.text(`🍕 ${p.name}`, `add_${p.id}`).row());
      keyboard.text("⬅️ Orqaga", "back");
      await ctx.editMessageText("😋 **Taomni tanlang:**", { reply_markup: keyboard });
    });

    this.bot.callbackQuery(/^add_(\d+)$/, async (ctx: any) => {
      const product = await this.prisma.product.findUnique({ where: { id: parseInt(ctx.match[1]) } });
      if (product) { ctx.session.cart.push(product); await ctx.answerCallbackQuery(`✅ Qo'shildi!`); }
    });

    this.bot.callbackQuery('clear_cart', (ctx: any) => { 
      ctx.session.cart = []; 
      this.showCategories(ctx, true); 
    });

    await this.bot.start();
  }

  // ========================================
  // BACK LOGIC
  // ========================================
  async handleBackButton(ctx: any) {
    ctx.session.lastAction = 'menu';
    await this.showCategories(ctx, true);
    await ctx.answerCallbackQuery();
  }

  async showCategories(ctx: any, edit: boolean = false) {
    const categories = await this.prisma.category.findMany();
    const keyboard = new InlineKeyboard();
    categories.forEach(c => keyboard.text(`🍴 ${c.name}`, `cat_${c.id}`).row());
    if (edit) await ctx.editMessageText("🍽 **Kategoriyani tanlang:**", { reply_markup: keyboard });
    else await ctx.reply("🍽 **Kategoriyani tanlang:**", { reply_markup: keyboard });
  }

  async showCart(ctx: any) {
    if (!ctx.session.cart?.length) return ctx.reply("🛒 Savatingiz bo'sh.");
    let total = 0;
    let text = "🛒 **Savatingiz:**\n\n";
    const keyboard = new InlineKeyboard();
    ctx.session.cart.forEach((p: any, i: number) => {
      text += `${i + 1}. ${p.name} - ${p.price.toLocaleString()} so'm\n`;
      total += p.price;
      keyboard.text(`❌ ${p.name}`, `remove_${i}`).row();
    });
    text += `\n💰 **Jami: ${total.toLocaleString()} so'm**`;
    keyboard.text("✅ Tasdiqlash", "confirm_order").row();
    keyboard.text("⬅️ Orqaga", "back").text("🗑 Tozalash", "clear_cart");
    await ctx.reply(text, { reply_markup: keyboard });
  }
}