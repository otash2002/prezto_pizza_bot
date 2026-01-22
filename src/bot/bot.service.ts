import { Injectable, OnModuleInit } from '@nestjs/common';
import { Bot, InlineKeyboard, Keyboard, session } from 'grammy';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class BotService implements OnModuleInit {
  private readonly prisma = new PrismaClient();
  private readonly bot = new Bot(process.env.BOT_TOKEN!);
  private readonly ADMIN_ID = process.env.ADMIN_ID!;

  async onModuleInit() {
    this.bot.use(session({ 
      initial: () => ({ 
        cart: [] as any[], 
        phone: '', 
        orderType: '', 
        location: null as any,
        lastAction: 'menu' // ❗ Oxirgi harakatni kuzatish
      }) 
    }));

    const WEB_APP_URL = "https://otash2002.github.io/prezto_pizza_bot/?v=2";

    const mainMenu = new Keyboard()
      .webApp("🍴 Menyu", WEB_APP_URL)
      .text("🛒 Savat")
      .row()
      .text("🔄 Qayta boshlash")
      .text("📞 Aloqa")
      .resized()
      .persistent();

    const isWorkingTime = () => {
      const now = new Date();
      const uzbTime = new Date(now.getTime() + (5 * 60 * 60 * 1000));
      const hour = uzbTime.getUTCHours(); 
      return (hour >= 9 || hour < 3);
    };

    // ========================================
    // START COMMAND
    // ========================================
    const startAction = async (ctx: any) => {
      ctx.session.cart = [];
      ctx.session.lastAction = 'menu';
      
      const user = await this.prisma.user.findUnique({ 
        where: { telegramId: ctx.from.id.toString() } 
      });

      if (user) {
        ctx.session.phone = user.phone;
        const typeKeyboard = new InlineKeyboard()
          .text("🚖 Yetkazib berish", "type_delivery")
          .text("🛍 Olib ketish", "type_pickup");
        
        await ctx.reply(
          `🍕 **Presto Pizza** ga xush kelibsiz, ${user.name}!\n\nXizmat turini tanlang:`, 
          { reply_markup: typeKeyboard }
        );
      } else {
        await ctx.reply(
          `🍕 **Presto Pizza** ga xush kelibsiz!\n\nRo'yxatdan o'tish uchun raqamingizni yuboring:`, 
          {
            reply_markup: new Keyboard()
              .requestContact("📞 Raqamni yuborish")
              .resized()
              .oneTime()
          }
        );
      }
    };

    this.bot.command('start', startAction);

    // ========================================
    // ORTGA QAYTISH TUGMASI HANDLER
    // ========================================
    this.bot.on('callback_query:data', async (ctx, next) => {
      const data = ctx.callbackQuery.data;
      
      // Orqaga tugmasi bosilganda
      if (data === 'back') {
        await this.handleBackButton(ctx);
        return;
      }
      
      return next();
    });

    // ========================================
    // TELEFON RAQAM
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
      
      await ctx.reply(
        "✅ Ro'yxatdan o'tdingiz!\n\nXizmat turini tanlang:", 
        { reply_markup: typeKeyboard }
      );
    });

    // ========================================
    // XIZMAT TURI
    // ========================================
    this.bot.callbackQuery('type_delivery', async (ctx: any) => {
      ctx.session.orderType = 'Yetkazib berish';
      ctx.session.lastAction = 'selecting_delivery';
      await ctx.answerCallbackQuery();
      
      await ctx.editMessageText("📍 **Yetkazib berish tanlandi**");
      
      await ctx.reply(
        "Manzilni yuborish uchun pastdagi tugmani bosing 👇", 
        {
          reply_markup: new Keyboard()
            .requestLocation("📍 Lokatsiyani yuborish")
            .resized()
            .oneTime()
        }
      );
    });

    this.bot.callbackQuery('type_pickup', async (ctx: any) => {
      ctx.session.orderType = 'Olib ketish';
      ctx.session.location = null;
      ctx.session.lastAction = 'menu';
      await ctx.answerCallbackQuery();
      
      await ctx.editMessageText("🛍 **Olib ketish tanlandi**");
      
      await ctx.reply(
        "✅ Bizning manzil: Chartak sh., Alisher Navoiy ko'chasi.\n\nMenudan buyurtma bering 👇", 
        { reply_markup: mainMenu }
      );
    });

    // ========================================
    // LOKATSIYA
    // ========================================
    this.bot.on('message:location', async (ctx: any) => {
      ctx.session.location = ctx.message.location;
      ctx.session.lastAction = 'menu';
      
      await ctx.reply(
        "✅ Manzil qabul qilindi!\n\nEndi menudan buyurtma bering 👇", 
        { reply_markup: mainMenu }
      );
    });

    // ========================================
    // MINI APP DAN BUYURTMA
    // ========================================
    this.bot.on('message:web_app_data', async (ctx: any) => {
      try {
        const orderItems = JSON.parse(ctx.message.web_app_data.data);
        
        if (!orderItems || orderItems.length === 0) {
          return ctx.reply("❌ Buyurtma bo'sh!");
        }

        if (!ctx.session.phone) {
          return ctx.reply("❌ Avval raqamingizni yuboring!");
        }

        if (!ctx.session.orderType) {
          const typeKeyboard = new InlineKeyboard()
            .text("🚖 Yetkazib berish", "type_delivery")
            .text("🛍 Olib ketish", "type_pickup");
          
          return ctx.reply(
            "❌ Avval xizmat turini tanlang:", 
            { reply_markup: typeKeyboard }
          );
        }

        if (ctx.session.orderType === 'Yetkazib berish' && !ctx.session.location) {
          return ctx.reply(
            "❌ Yetkazib berish uchun manzilni yuboring!", 
            {
              reply_markup: new Keyboard()
                .requestLocation("📍 Lokatsiyani yuborish")
                .resized()
                .oneTime()
            }
          );
        }

        // Buyurtma xabari
        let orderSummary = "🚀 **Mini App-dan yangi buyurtma!**\n\n";
        orderSummary += `👤 **Mijoz:** ${ctx.from.first_name}\n`;
        orderSummary += `📞 **Telefon:** ${ctx.session.phone}\n`;
        orderSummary += `🚚 **Turi:** ${ctx.session.orderType}\n\n`;
        orderSummary += `📦 **Buyurtma tarkibi:**\n`;
        
        let totalPrice = 0;

        orderItems.forEach((item: any, index: number) => {
          const itemTotal = item.price * item.quantity;
          totalPrice += itemTotal;
          
          orderSummary += `${index + 1}. ${item.name}\n`;
          orderSummary += `   ${item.quantity} x ${item.price.toLocaleString()} = ${itemTotal.toLocaleString()} so'm\n\n`;
        });

        orderSummary += `💰 **JAMI: ${totalPrice.toLocaleString()} so'm**`;

        // Admin ga yuborish
        const adminKeyboard = new InlineKeyboard()
          .text("✅ Qabul qilish", `accept_${ctx.from.id}_${totalPrice}`)
          .text("❌ Rad etish", `reject_${ctx.from.id}`)
          .row()
          .text("📞 Aloqa", `contact_${ctx.from.id}`);

        await this.bot.api.sendMessage(
          this.ADMIN_ID, 
          orderSummary, 
          { 
            parse_mode: 'Markdown',
            reply_markup: adminKeyboard 
          }
        );

        if (ctx.session.location) {
          await this.bot.api.sendLocation(
            this.ADMIN_ID, 
            ctx.session.location.latitude, 
            ctx.session.location.longitude,
            {
              reply_markup: new InlineKeyboard().url(
                "📍 Xaritada ko'rish",
                `https://www.google.com/maps?q=${ctx.session.location.latitude},${ctx.session.location.longitude}`
              )
            }
          );
        }

        await ctx.reply(
          `✅ **Buyurtmangiz qabul qilindi!**\n\n` +
          `💰 Jami: ${totalPrice.toLocaleString()} so'm\n\n` +
          `⏳ Operatorlarimiz tez orada siz bilan bog'lanadi.`,
          { reply_markup: mainMenu }
        );

        ctx.session.cart = [];
        ctx.session.lastAction = 'menu';

      } catch (error) {
        console.error('Xatolik:', error);
        await ctx.reply("❌ Xatolik yuz berdi. Qayta urinib ko'ring.");
      }
    });

    // ========================================
    // ADMIN TUGMALARI
    // ========================================
    this.bot.callbackQuery(/^accept_(\d+)_(\d+)$/, async (ctx: any) => {
      const userId = ctx.match[1];
      const totalPrice = ctx.match[2];
      
      await ctx.answerCallbackQuery("✅ Buyurtma qabul qilindi");
      
      try {
        await this.bot.api.sendMessage(
          userId,
          `✅ **Buyurtmangiz qabul qilindi!**\n\n` +
          `💰 Summa: ${parseInt(totalPrice).toLocaleString()} so'm\n` +
          `⏰ Tayyorlanish vaqti: 30-40 daqiqa\n\n` +
          `📞 Savollar uchun: +998 94 677 75 90\n\n` +
          `🙏 Rahmat! Yaxshi ishtaha!`
        );
        
        await ctx.editMessageText(
          ctx.callbackQuery.message.text + "\n\n✅ **STATUS: QABUL QILINDI**"
        );
      } catch (error) {
        await ctx.answerCallbackQuery("❌ Xabar yuborishda xatolik", { show_alert: true });
      }
    });

    this.bot.callbackQuery(/^reject_(\d+)$/, async (ctx: any) => {
      const userId = ctx.match[1];
      
      await ctx.answerCallbackQuery("❌ Buyurtma rad etildi");
      
      try {
        await this.bot.api.sendMessage(
          userId,
          `❌ **Kechirasiz, buyurtmangiz qabul qilinmadi.**\n\n` +
          `Sabab: Mahsulot tugagan yoki boshqa texnik muammo.\n\n` +
          `📞 Savollar uchun: +998 94 677 75 90\n\n` +
          `Yana buyurtma berishingiz mumkin 👇`
        );
        
        await ctx.editMessageText(
          ctx.callbackQuery.message.text + "\n\n❌ **STATUS: RAD ETILDI**"
        );
      } catch (error) {
        await ctx.answerCallbackQuery("❌ Xabar yuborishda xatolik", { show_alert: true });
      }
    });

    this.bot.callbackQuery(/^contact_(\d+)$/, async (ctx: any) => {
      const userId = ctx.match[1];
      
      const user = await this.prisma.user.findUnique({
        where: { telegramId: userId }
      });
      
      if (user && user.phone) {
        await ctx.answerCallbackQuery();
        await ctx.reply(`📞 Mijoz raqami: ${user.phone}`);
      } else {
        await ctx.answerCallbackQuery("❌ Telefon raqam topilmadi", { show_alert: true });
      }
    });

    // ========================================
    // MATNLI BUYRUQLAR
    // ========================================
    this.bot.on('message:text', async (ctx: any) => {
      const text = ctx.message.text;
      
      if (text === "🛒 Savat") {
        ctx.session.lastAction = 'cart';
        await this.showCart(ctx);
      } else if (text === "🔄 Qayta boshlash") {
        await startAction(ctx);
      } else if (text === "📞 Aloqa") {
        await ctx.reply(
          "📞 **Aloqa ma'lumotlari:**\n\n" +
          "☎️ Telefon: +998 94 677 75 90\n" +
          "📍 Manzil: Chartak sh., Alisher Navoiy ko'chasi\n" +
          "🕒 Ish vaqti: 09:00 - 03:00"
        );
      }
    });

    // ========================================
    // KATEGORIYALAR (eski bot uchun)
    // ========================================
    this.bot.callbackQuery(/^cat_(\d+)$/, async (ctx: any) => {
      const catId = parseInt(ctx.match[1]);
      ctx.session.lastAction = `category_${catId}`;
      
      const products = await this.prisma.product.findMany({ 
        where: { categoryId: catId } 
      });
      
      const keyboard = new InlineKeyboard();
      products.forEach(p => {
        keyboard.text(`🍕 ${p.name} - ${p.price.toLocaleString()}`, `add_${p.id}`).row();
      });
      keyboard.text("⬅️ Orqaga", "back");
      
      await ctx.editMessageText("😋 **Taomni tanlang:**", { reply_markup: keyboard });
    });

    this.bot.callbackQuery(/^add_(\d+)$/, async (ctx: any) => {
      const product = await this.prisma.product.findUnique({ 
        where: { id: parseInt(ctx.match[1]) } 
      });
      
      if (product) { 
        ctx.session.cart.push(product); 
        await ctx.answerCallbackQuery(`✅ ${product.name} qo'shildi!`);
      }
    });

    this.bot.callbackQuery('back_to_cats', (ctx: any) => {
      ctx.session.lastAction = 'menu';
      this.showCategories(ctx, true);
    });

    this.bot.callbackQuery('clear_cart', (ctx: any) => { 
      ctx.session.cart = [];
      ctx.session.lastAction = 'menu';
      this.showCategories(ctx, true); 
    });

    this.bot.callbackQuery('confirm_order', async (ctx: any) => {
      if (!isWorkingTime()) {
        return ctx.answerCallbackQuery("⚠️ Hozir ish vaqti emas", { show_alert: true });
      }
      
      if (ctx.session.cart.length === 0) {
        return ctx.answerCallbackQuery("🛒 Savat bo'sh!");
      }

      // Buyurtma yuborish...
    });

    await this.bot.start();
    console.log('🤖 Bot ishga tushdi!');
  }

  // ========================================
  // ORTGA QAYTISH LOGIKASI
  // ========================================
  async handleBackButton(ctx: any) {
    const lastAction = ctx.session.lastAction;
    
    if (lastAction === 'cart') {
      // Savatdan menyuga qaytish
      ctx.session.lastAction = 'menu';
      await this.showCategories(ctx, true);
    } else if (lastAction.startsWith('category_')) {
      // Kategoriyadan menyuga qaytish
      ctx.session.lastAction = 'menu';
      await this.showCategories(ctx, true);
    } else {
      // Default - menyuga qaytish
      ctx.session.lastAction = 'menu';
      await this.showCategories(ctx, true);
    }
    
    await ctx.answerCallbackQuery();
  }

  // ========================================
  // YORDAMCHI FUNKSIYALAR
  // ========================================
  async showCategories(ctx: any, edit: boolean = false) {
    const categories = await this.prisma.category.findMany();
    const keyboard = new InlineKeyboard();
    
    const emojis: any = { 
      'pizza': '🍕', 'pitsa': '🍕', 
      'burger': '🍔', 
      'lavash': '🌯', 
      'ichimlik': '🥤', 
      'doner': '🥙', 
      'hot-dog': '🌭', 'hotdog': '🌭',
      'sandwich': '🥪', 'sendvich': '🥪' 
    };
    
    categories.forEach(c => {
      const emoji = emojis[c.name.toLowerCase()] || '🍴';
      keyboard.text(`${emoji} ${c.name}`, `cat_${c.id}`).row();
    });

    const text = "🍽 **Kategoriyani tanlang:**";
    
    if (edit && ctx.callbackQuery) {
      await ctx.editMessageText(text, { reply_markup: keyboard });
    } else {
      await ctx.reply(text, { reply_markup: keyboard });
    }
  }

  async showCart(ctx: any) {
    if (!ctx.session.cart || ctx.session.cart.length === 0) {
      return ctx.reply("🛒 Savatingiz bo'sh.\n\nMenudan buyurtma bering 👇");
    }
    
    let total = 0;
    let text = "🛒 **Savatingiz:**\n\n";
    const keyboard = new InlineKeyboard();
    
    ctx.session.cart.forEach((p: any, index: number) => {
      text += `${index + 1}. ${p.name} - ${p.price.toLocaleString()} so'm\n`;
      total += p.price;
      keyboard.text(`❌ ${p.name}`, `remove_${index}`).row();
    });
    
    text += `\n💰 **Jami: ${total.toLocaleString()} so'm**`;
    keyboard.text("✅ Tasdiqlash", "confirm_order").row();
    keyboard.text("⬅️ Orqaga", "back").text("🗑 Tozalash", "clear_cart");
    
    await ctx.reply(text, { reply_markup: keyboard });
  }
}