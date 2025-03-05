const express = require('express');
const mysql = require('mysql2');
const app = express();
app.use(express.json());

const port = 5000;

const pool = mysql.createPool({
  host: '202.151.177.35',
  user: 'root',
  password: 'arka',
  database: 'SoleTeeN',
  port: 3306,
});

let orderCache = null;

app.post('/insertProducts', (req, res) => {
  const { product_name, product_brand, category_id, product_price, stock_quantity, description, image_url } = req.body;

  console.log("Received Data:", req.body);

  const sql = `
    INSERT INTO Products (product_name, product_brand, category_id, product_price, stock_quantity, description, image_url) 
    VALUES (?, ?, ?, ?, ?, ?, ?)`;

  pool.query(sql, [product_name, product_brand, category_id, product_price, stock_quantity, description, image_url], (err, result) => {
    if (err) {
      console.error("Error inserting data:", err);
      return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    } else {
      console.log("Insert Success, ID:", result.insertId);
      return res.status(201).json({ message: 'Insert Success', insertedId: result.insertId });
    }
  });
});

app.post('/send_Order',(req,res) =>{

  const sql = 'SELECT * FROM Orders';
  pool.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching order:", err);
      return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    }
    return res.status(200).json({results });
  })
})

app.post('/Payments', (req, res) => {
  const { id_order } = req.body;
  orderCache = id_order;
  console.log("Received id_order:", id_order);

  if (!id_order || isNaN(id_order)) {
    return res.status(400).json({ error: 'กรุณาส่ง id_order เป็นตัวเลข' });
  }

  const sql = 'SELECT * FROM Orders WHERE order_id = ?';
  pool.query(sql, [orderCache], (err, results) => {
    if (err) {
      console.error("Error fetching order:", err);
      return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    }

    console.log("Fetched Data:", results);

    if (results.length === 0) {
      return res.status(404).json({ message: 'ไม่พบข้อมูลคำสั่งซื้อนี้' });
    }

    res.status(200).json(results);
  });
});

app.post('/confirm', (req, res) => {
  const { confirm, payment_method } = req.body;
  order_id = orderCache
  const payment_status = "ชำระแล้ว";

  console.log("ค่าที่ได้รับ:", confirm);
  console.log("Order ID:", order_id);

  if (!order_id) {
    return res.status(400).json({ error: "ไม่ได้รับข้อมูลคำสั่งซื้อ" });
  }


  if (confirm === "cancel") {
    const check_order = `SELECT product_id, quantity FROM Order_Items WHERE order_id = ?`;

    pool.query(check_order, [order_id], (err, results) => {
      if (err) {
        console.error("Error fetching order details:", err);
        return res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูลคำสั่งซื้อ" });
      }

      if (results.length === 0) {
        return res.status(404).json({ error: "ไม่พบคำสั่งซื้อนี้" });
      }

      const updateStockPromises = results.map((item) => {
        return new Promise((resolve, reject) => {
          const update_stock = `UPDATE Products SET stock_quantity = stock_quantity + ? WHERE product_id = ?`;

          pool.query(update_stock, [item.quantity, item.product_id], (err, updateResult) => {
            if (err) {
              console.error("Error updating stock:", err);
              reject(err);
            } else {
              console.log(`Stock updated for product_id ${item.product_id}: +${item.quantity}`);
              resolve(updateResult);
            }
          });
        });
      });

      const update_order_status = `UPDATE Orders SET status = 'ยกเลิก' WHERE order_id = ?`;

      Promise.all(updateStockPromises)
        .then(() => {
          pool.query(update_order_status, [order_id], (err, updateResult) => {
            if (err) {
              console.error("Error updating order status:", err);
              return res.status(500).json({ error: "เกิดข้อผิดพลาดในการอัปเดตสถานะคำสั่งซื้อ" });
            }

            console.log(`Order ${order_id} canceled successfully`);
            return res.status(200).json({ message: "ยกเลิกคำสั่งซื้อสำเร็จ และคืนสินค้าเข้าสต็อก" });
          });
        })
        .catch(() => {
          return res.status(500).json({ error: "เกิดข้อผิดพลาดในการคืนสินค้าเข้าสต็อก" });
        });
    });

    return;
  }

  else if (confirm === "pay") {
    if (!payment_method) {
      return res.status(400).json({ error: "กรุณาระเลือกช้องทางการชำระเงิน" });
    }


    const sql = 'SELECT total_amount FROM Orders WHERE order_id = ?';
    pool.query(sql, [order_id], (err, results) => {
      if (err) {
        console.error("Error fetching order:", err);
        return res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูล" });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: "ไม่พบข้อมูลคำสั่งซื้อนี้" });
      }

      const payment_amount = results[0].total_amount;
      console.log("Price:", payment_amount);


      const paySQL = `
        INSERT INTO Payments (order_id, payment_method, payment_amount, payment_status, payment_date) 
        VALUES (?, ?, ?, ?, NOW())`;

      pool.query(paySQL, [order_id, payment_method, payment_amount, payment_status], (err, result) => {
        if (err) {
          console.error("Error inserting payment:", err);
          return res.status(500).json({ error: "เกิดข้อผิดพลาดในการบันทึกข้อมูลการชำระเงิน" });
        }

        console.log("Payment inserted successfully:", result);

        const updateSQL = `UPDATE Orders SET status = ? WHERE order_id = ?`;

        pool.query(updateSQL, [payment_status, order_id], (err, result) => {
          if (err) {
            console.error("Error updating order status:", err);
            return res.status(500).json({ error: "เกิดข้อผิดพลาดในการอัปเดตสถานะ" });
          }

          console.log("Order status updated:", result);

          return res.status(200).json({
            message: "บันทึกข้อมูลการชำระเงินและอัปเดตสถานะสำเร็จ",
            order_id,
            payment_method,
            payment_amount,
            payment_status
          });
        });
      });
    });

    return;
  }

  return res.status(400).json({ error: "คำสั่งไม่ถูกต้อง" });
});


app.post('/Order_Items', (req, res) => {
  const { customer_id, product_id, quantity } = req.body;
  console.log("Received Data:", req.body);

  if (!customer_id || !product_id || !quantity) {
    return res.status(400).json({ error: "กรุณาส่งข้อมูลให้ครบถ้วน (customer_id, product_id, quantity)" });
  }

  const check_stock = 'SELECT product_price, stock_quantity FROM Products WHERE product_id = ?';

  pool.query(check_stock, [product_id], (err, results) => {
    if (err) {
      console.error(" Error fetching product data:", err);
      return res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูลสินค้า" });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "⚠️ ไม่พบสินค้าที่ต้องการ" });
    }

    const product_price = results[0].product_price;
    const stock_quantity = results[0].stock_quantity;

    if (stock_quantity < quantity) {
      return res.status(400).json({ error: " สินค้าไม่เพียงพอในสต็อก" });
    }

    const price_product = quantity * product_price;
    console.log("Product Price Calculated:", price_product);

    const order_date = new Date();
    const status = "รอชำระ";

    const insert_order = `
      INSERT INTO Orders (customer_id, order_date, status, total_amount)
      VALUES (?, ?, ?, ?)`;

    pool.query(insert_order, [customer_id, order_date, status, price_product], (err, result) => {
      if (err) {
        console.error("Error inserting order:", err);
        return res.status(500).json({ error: "เกิดข้อผิดพลาดในการบันทึกคำสั่งซื้อ" });
      }

      const order_id = result.insertId;

      const insert_item = `
        INSERT INTO Order_Items (order_id, product_id, quantity, price)
        VALUES (?, ?, ?, ?)`;

      pool.query(insert_item, [order_id, product_id, quantity, product_price], (err, result) => {
        if (err) {
          console.error("Error inserting order item:", err);
          return res.status(500).json({ error: "เกิดข้อผิดพลาดในการบันทึกข้อมูลสินค้าคำสั่งซื้อ" });
        }

        const order_item_id = result.insertId;
        console.log("Order Item Inserted Successfully:", {
          order_item_id,
          order_id,
          product_id,
          quantity,
          price_product
        });

        const update_stock = `UPDATE Products SET stock_quantity = stock_quantity - ? WHERE product_id = ?`;

        pool.query(update_stock, [quantity, product_id], (err, updateResult) => {
          if (err) {
            console.error("Error updating stock quantity:", err);
            return res.status(500).json({ error: "เกิดข้อผิดพลาดในการอัปเดตสต็อกสินค้า" });
          }

          console.log("Stock updated successfully:", {
            product_id,
            new_stock_quantity: stock_quantity - quantity
          });

          res.status(200).json({
            message: "บันทึกข้อมูลสินค้าสำเร็จ",
            order_item_id,
            order_id,
            product_id,
            quantity,
            price_product,
            new_stock_quantity: stock_quantity - quantity
          });
        });
      });
    });
  });
});



app.post('/Customers', (req, res) => {
  const { customer_name, email, address, phone_number } = req.body;

  const insert = `
    INSERT INTO Customers (customer_name, email, address, phone_number)
    VALUES (?, ?, ?, ?)
  `;

  pool.query(insert, [customer_name, email, address, phone_number], (err, result) => {
    if (err) {
      console.error("Error inserting customer:", err);
      return res.status(500).json({ error: "เกิดข้อผิดพลาดในการบันทึกข้อมูลลูกค้า" });
    }

    console.log("Customer inserted successfully:", result);
    return res.status(200).json({ message: "บันทึกข้อมูลลูกค้าสำเร็จ", customer_id: result.insertId });

  });
})

app.post('/report', (req, res) => {
  const check = req.body.check;  // Access 'check' property from request body

  const generateReportSQL = `
  INSERT INTO daily_reports (order_id, order_date, customer_name, product_name, category_name, quantity, price, total_amount)
  SELECT 
      o.order_id, 
      o.order_date, 
      c.customer_name, 
      p.product_name AS product_name,  
      cat.category_name,  
      oi.quantity, 
      p.product_price AS price,
      (oi.quantity * p.product_price) AS total_amount
  FROM Orders o
  JOIN Customers c ON o.customer_id = c.customer_id
  JOIN Order_Items oi ON o.order_id = oi.order_id
  JOIN Products p ON oi.product_id = p.product_id
  JOIN Categories cat ON p.category_id = cat.category_id
  WHERE YEARWEEK(o.order_date, 1) = YEARWEEK(CURDATE(), 1);
  `;


  // Check for 'save' operation
  if (check === "save") {
    pool.query(generateReportSQL, (err, results) => {
      if (err) {
        console.error("Error generating daily report:", err);
        return res.status(500).json({ error: "เกิดข้อผิดพลาดในการสร้างรายงาน" });
      } else {
        console.log('Daily report generated successfully', results);

        const selectReportSQL = `SELECT * FROM daily_reports`;

        pool.query(selectReportSQL, (err, reportResults) => {
          if (err) {
            console.error("Error fetching daily report data:", err);
            return res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูลรายงาน" });
          }

          console.log("Fetched daily reports:", reportResults);
          return res.status(200).json({ message: "รายงานถูกสร้างเรียบร้อยแล้ว", data: reportResults });
        });
      }
    });
  }
  // Check for 'view' operation
  else if (check === "view") {
    const view = `SELECT * FROM daily_reports`;

    pool.query(view, (err, report) => {
      if (err) {
        console.error("Error fetching daily report:", err);
        return res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูลรายงาน" });
      }
      return res.status(200).json({ message: "รายงานถูกดึงข้อมูลเรียบร้อยแล้ว", data: report });
    });
  } else {
    // In case the `check` value is neither "save" nor "view"
    res.status(400).json({ message: "ไม่พบคำสั่งที่ถูกต้อง" });
  }
});





app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});