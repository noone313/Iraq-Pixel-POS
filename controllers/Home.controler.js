



async function Home(req,res) {
    try {
      
        res.render('reports', {
                title: 'تقرير المبيعات والمشتريات',
        });
    } catch (error) {
        console.error("Dashboard Error:", error);
        res.status(500).send("خطأ في تحميل البيانات");
    }
}



export { Home };